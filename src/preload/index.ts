import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ThumbMeta {
  index: number | null
  streamName: string
  name: string | null
  label: string
  date: string | null
  format: 'jpeg' | 'dib' | 'abbrev-jpeg' | 'png'
  width: number | null
  height: number | null
  size: number
  orphan: boolean // a real filename whose original no longer exists in the source folder (recoverable)
}

export interface OpenResult {
  path: string
  count: number
  failed: number
  catalogCount: number
  recovered: boolean // JPEGs raw-carved from a damaged container; metadata unavailable
  entries: ThumbMeta[]
}

export type OpenResponse = OpenResult | { error: string; path?: string } | null

export type SizeMode = 'original' | 'upscale800'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface ExportOpts {
  streamNames: string[] | null // null = all entries
  mode: SizeMode
  quality: number
  includeCsv: boolean
  skipExisting: boolean
  toSourceFolder: boolean
}

export type ExportResponse =
  | { ok: number; failed: number; skipped: number; outDir: string }
  | { error: string }
  | null

export interface ExportProgress {
  done: number
  total: number
}

const api = {
  openFile: (): Promise<OpenResponse> => ipcRenderer.invoke('open-file'),
  openPath: (path: string): Promise<OpenResponse> => ipcRenderer.invoke('open-path', path),
  getImage: (streamName: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('get-image', streamName),
  exportThumbs: (opts: ExportOpts): Promise<ExportResponse> =>
    ipcRenderer.invoke('export-thumbs', opts),
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke('open-folder', path),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('copy-text', text),
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: ExportProgress): void => cb(p)
    ipcRenderer.on('export-progress', listener)
    return () => ipcRenderer.off('export-progress', listener)
  },
  // Main pushes an open result when launched/re-launched with a file or folder path (shell integration).
  onShellOpen: (cb: (r: OpenResponse) => void): (() => void) => {
    const listener = (_e: unknown, r: OpenResponse): void => cb(r)
    ipcRenderer.on('shell-open', listener)
    return () => ipcRenderer.off('shell-open', listener)
  },
  // Window/View menubar actions (native menu disabled; menubar lives in the renderer).
  windowAction: (action: string): Promise<void> => ipcRenderer.invoke('window-action', action),
  // Theme: set the OS source, returns whether dark should be used now.
  setTheme: (source: ThemeChoice): Promise<boolean> => ipcRenderer.invoke('set-theme', source),
  getTheme: (): Promise<boolean> => ipcRenderer.invoke('get-theme'),
  // Pushed when the OS theme changes while themeSource is 'system'.
  onThemeUpdated: (cb: (shouldUseDark: boolean) => void): (() => void) => {
    const listener = (_e: unknown, shouldUseDark: boolean): void => cb(shouldUseDark)
    ipcRenderer.on('theme-updated', listener)
    return () => ipcRenderer.off('theme-updated', listener)
  },
  // Resolve the absolute path of a dropped File (renderer File objects no longer expose .path).
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
