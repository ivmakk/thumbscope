// Single source of truth for the renderer<->main IPC boundary: channel names and their
// payload/response types. preload, main, and renderer all route through this module so a
// channel rename is one edit (caught by tsgo on every reference) and payload/response types
// can't drift between the invoke side and the handle side.
//
// No Electron or DOM imports here - this file is consumed by the renderer (web project), the
// main process (node project), and the node:test contract check (`src/ipc-contract.test.ts`).

import type { SizeMode } from '../core/export.ts'

export type { SizeMode }

// Request/response channels: every key must have a matching `ipcMain.handle(CHANNELS.<key>, ...)`
// in main and an `ipcRenderer.invoke(CHANNELS.<key>, ...)` in preload. The wiring test
// (src/ipc-contract.test.ts) asserts the registered-handler set equals Object.keys(CHANNELS).
export const CHANNELS = {
  openFile: 'open-file',
  openPath: 'open-path',
  getImage: 'get-image',
  exportThumbs: 'export-thumbs',
  openFolder: 'open-folder',
  copyText: 'copy-text',
  windowAction: 'window-action',
  setTheme: 'set-theme',
  getTheme: 'get-theme'
} as const

// Push channels: main -> renderer one-way (webContents.send / ipcRenderer.on). Not part of the
// invoke/handle contract, so kept separate from CHANNELS, but constant-named to avoid drift.
export const PUSH = {
  exportProgress: 'export-progress',
  shellOpen: 'shell-open',
  themeUpdated: 'theme-updated'
} as const

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
  format: string // container slug the handler resolved (cfb / irfanview-* / sqlite-photothumb / recovered)
  entries: ThumbMeta[]
}

export type OpenResponse = OpenResult | { error: string; path?: string } | null

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
