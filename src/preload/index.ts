import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CHANNELS, PUSH } from '../shared/ipc.ts'
import type {
  ThumbMeta,
  OpenResult,
  OpenResponse,
  SizeMode,
  ThemeChoice,
  ExportOpts,
  ExportResponse,
  ExportProgress
} from '../shared/ipc.ts'

// Re-export the contract types so renderer modules can keep importing them from the preload
// surface (back-compat); the canonical home is now src/shared/ipc.ts.
export type {
  ThumbMeta,
  OpenResult,
  OpenResponse,
  SizeMode,
  ThemeChoice,
  ExportOpts,
  ExportResponse,
  ExportProgress
}

const api = {
  openFile: (): Promise<OpenResponse> => ipcRenderer.invoke(CHANNELS.openFile),
  // `format` (optional) forces a container handler by slug, skipping detection (manual override).
  openPath: (path: string, format?: string): Promise<OpenResponse> =>
    ipcRenderer.invoke(CHANNELS.openPath, path, format),
  getImage: (streamName: string): Promise<{ mime: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke(CHANNELS.getImage, streamName),
  exportThumbs: (opts: ExportOpts): Promise<ExportResponse> =>
    ipcRenderer.invoke(CHANNELS.exportThumbs, opts),
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke(CHANNELS.openFolder, path),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(CHANNELS.copyText, text),
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: ExportProgress): void => cb(p)
    ipcRenderer.on(PUSH.exportProgress, listener)
    return () => ipcRenderer.off(PUSH.exportProgress, listener)
  },
  // Main pushes an open result when launched/re-launched with a file or folder path (shell integration).
  onShellOpen: (cb: (r: OpenResponse) => void): (() => void) => {
    const listener = (_e: unknown, r: OpenResponse): void => cb(r)
    ipcRenderer.on(PUSH.shellOpen, listener)
    return () => ipcRenderer.off(PUSH.shellOpen, listener)
  },
  // Window/View menubar actions (native menu disabled; menubar lives in the renderer).
  windowAction: (action: string): Promise<void> => ipcRenderer.invoke(CHANNELS.windowAction, action),
  // Theme: set the OS source, returns whether dark should be used now.
  setTheme: (source: ThemeChoice): Promise<boolean> => ipcRenderer.invoke(CHANNELS.setTheme, source),
  getTheme: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.getTheme),
  // Pushed when the OS theme changes while themeSource is 'system'.
  onThemeUpdated: (cb: (shouldUseDark: boolean) => void): (() => void) => {
    const listener = (_e: unknown, shouldUseDark: boolean): void => cb(shouldUseDark)
    ipcRenderer.on(PUSH.themeUpdated, listener)
    return () => ipcRenderer.off(PUSH.themeUpdated, listener)
  },
  // Resolve the absolute path of a dropped File (renderer File objects no longer expose .path).
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
