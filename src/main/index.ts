import { join, dirname } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell, clipboard, Menu, nativeTheme } from 'electron'
import { parseThumbsDb } from '../core/parser.ts'
import { isSqliteFile, parsePhotothumb } from '../core/photothumb.ts'
import { payloadToImage } from '../core/image.ts'
import { exportEntries, renderAbbrevJpeg, type ExportSummary } from '../core/encode.ts'
import type { SizeMode } from '../core/export.ts'
import { firstPathArg, resolveDbPath } from '../core/shell.ts'
import type { ThumbEntry } from '../core/types.ts'

// Cache the last parsed file so the renderer can lazily pull image bytes per stream (no base64 up front).
let current: { path: string; entries: Map<string, ThumbEntry> } | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    // Packaged builds use the exe-embedded icon; in dev point at the source PNG so the
    // taskbar/window show branding (import.meta.dirname is out/main -> repo build/).
    ...(app.isPackaged ? {} : { icon: join(import.meta.dirname, '../../build/icon.png') }),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

// Open a path from a shell launch (argv / second-instance / context menu) and push the result to the
// renderer, which renders it exactly like a dialog/drop open. Waits for the page if it is still loading.
async function openPathToWindow(path: string): Promise<void> {
  const win = mainWindow
  if (!win) return
  const result = await openPath(path)
  const send = (): void => win.webContents.send('shell-open', result)
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function toMeta(e: ThumbEntry) {
  return {
    index: e.index,
    streamName: e.streamName,
    name: e.name,
    label: e.label,
    date: e.date ? e.date.toISOString() : null,
    format: e.payload.kind,
    width: e.width,
    height: e.height,
    size: e.size
  }
}

async function openPath(path: string) {
  const resolved = await resolveDbPath(path)
  if ('error' in resolved) return { ...resolved, path }
  path = resolved.path
  // Read only the 16-byte header to route by magic; the OLE2 path reads the full buffer, the SQLite
  // path reopens by path inside parsePhotothumb (so no whole-file read just to discard it).
  let sqlite: boolean
  let buf: Buffer | null = null
  try {
    sqlite = await isSqliteFile(path)
    if (!sqlite) buf = await readFile(path)
  } catch (err) {
    return { error: `Could not read file: ${(err as Error).message}`, path }
  }
  let parsed
  try {
    parsed = sqlite ? parsePhotothumb(path) : parseThumbsDb(buf!)
  } catch (err) {
    return { error: (err as Error).message, path }
  }
  current = { path, entries: new Map(parsed.entries.map((e) => [e.streamName, e])) }

  // Orphan detection: a thumbnail whose original filename is no longer present in the source folder
  // (e.g. the photo was deleted) — its thumbnail survives in the DB and is recoverable. Only works
  // for entries with a real catalog name; folders we can't list yield no detection.
  let dirNames: Set<string> | null = null
  try {
    dirNames = new Set((await readdir(dirname(path))).map((f) => f.toLowerCase()))
  } catch {
    dirNames = null
  }
  // Only trust orphan detection when at least one original is actually present in the folder. If
  // nothing matches, this likely isn't the source gallery (e.g. the DB copied elsewhere) — skip,
  // rather than flag everything as recoverable.
  const named = parsed.entries.filter((e) => !!e.name)
  const matchedAny = !!dirNames && named.some((e) => dirNames!.has(e.name!.toLowerCase()))
  const isOrphan = (e: ThumbEntry): boolean => matchedAny && !!e.name && !dirNames!.has(e.name!.toLowerCase())

  return {
    path,
    count: parsed.count,
    failed: parsed.failed,
    catalogCount: parsed.catalogCount,
    recovered: parsed.recovered,
    entries: parsed.entries.map((e) => ({ ...toMeta(e), orphan: isOrphan(e) }))
  }
}

async function openViaDialog() {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Thumbnail DB', extensions: ['db'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (r.canceled || !r.filePaths[0]) return null
  return openPath(r.filePaths[0])
}

ipcMain.handle('open-file', openViaDialog)

ipcMain.handle('open-path', (_e, path: string) => openPath(path))

ipcMain.handle('get-image', async (_e, streamName: string) => {
  const entry = current?.entries.get(streamName)
  if (!entry) return null
  if (entry.payload.kind === 'abbrev-jpeg') {
    try {
      return { mime: 'image/png', bytes: await renderAbbrevJpeg(entry.payload.data) } // abbrev-jpeg decode -> PNG
    } catch {
      return null // subsampled/non-baseline decode throws -> entry lists without an image
    }
  }
  const img = payloadToImage(entry.payload)
  return { mime: img.mime, bytes: img.data } // Buffer -> Uint8Array over IPC
})

interface ExportOpts {
  streamNames: string[] | null // null = all entries
  mode: SizeMode
  quality: number
  includeCsv: boolean
  skipExisting: boolean
  toSourceFolder: boolean
}

ipcMain.handle('export-thumbs', async (e, opts: ExportOpts) => {
  if (!current) return { error: 'No file open' }
  let outDir: string
  if (opts.toSourceFolder) {
    outDir = dirname(current.path)
  } else {
    const dir = await dialog.showOpenDialog({
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (dir.canceled || !dir.filePaths[0]) return null
    outDir = dir.filePaths[0]
  }

  const list = opts.streamNames
    ? opts.streamNames.map((n) => current!.entries.get(n)).filter((x): x is ThumbEntry => !!x)
    : [...current.entries.values()]

  const summary: ExportSummary = await exportEntries(
    list,
    {
      outDir,
      mode: opts.mode,
      quality: opts.quality,
      skipExisting: opts.skipExisting,
      includeCsv: opts.includeCsv
    },
    (done, total) => e.sender.send('export-progress', { done, total })
  )
  return summary
})

ipcMain.handle('open-folder', (_e, path: string) => shell.openPath(path))

ipcMain.handle('copy-text', (_e, text: string) => clipboard.writeText(text))

// Theme: renderer owns the choice (persisted in localStorage); main holds the OS source of truth.
// 'system' lets nativeTheme follow the OS and fire 'updated' on OS changes (the auto-detect piece).
ipcMain.handle('set-theme', (_e, source: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = source
  return nativeTheme.shouldUseDarkColors
})
ipcMain.handle('get-theme', () => nativeTheme.shouldUseDarkColors)

// Window/View actions driven by the custom in-renderer menubar (the native menu is disabled).
ipcMain.handle('window-action', (e, action: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  const wc = win.webContents
  switch (action) {
    case 'minimize': win.minimize(); break
    case 'close': win.close(); break
    case 'quit': app.quit(); break
    case 'reload': wc.reload(); break
    case 'toggle-devtools': wc.toggleDevTools(); break
    case 'toggle-fullscreen': win.setFullScreen(!win.isFullScreen()); break
    case 'zoom-in': wc.setZoomLevel(wc.getZoomLevel() + 0.5); break
    case 'zoom-out': wc.setZoomLevel(wc.getZoomLevel() - 0.5); break
    case 'zoom-reset': wc.setZoomLevel(0); break
  }
})

// Single-instance: a second launch (e.g. another context-menu click) hands its argv to the running
// instance instead of starting a new process.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const path = firstPathArg(argv.slice(1))
    if (path) openPathToWindow(path)
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null) // custom in-renderer menubar replaces the native menu
    createWindow()
    // OS theme change while running (only fires when themeSource = 'system'): push to renderer for live flip.
    nativeTheme.on('updated', () =>
      mainWindow?.webContents.send('theme-updated', nativeTheme.shouldUseDarkColors)
    )
    // Launched with a file/folder path (file association or context menu)? Open it directly.
    const launchPath = firstPathArg(process.argv.slice(1))
    if (launchPath) openPathToWindow(launchPath)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
