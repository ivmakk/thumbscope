// Electron-free helpers for shell integration (argv launch + folder-target resolution).
// Shared by the GUI main process and the CLI.

import { join } from 'node:path'
import { stat, readdir } from 'node:fs/promises'

// Supported thumbnail-db filenames, in priority order (matched case-insensitively).
export const SUPPORTED_DB_NAMES = ['thumbs.db', 'ehthumbs.db', 'ehthumbs_vista.db', 'ivthumbs.db']

// Given a folder's directory listing, choose the best supported db filename (real cased name), or null.
export function pickDbName(entries: string[]): string | null {
  const byLower = new Map(entries.map((n) => [n.toLowerCase(), n]))
  for (const cand of SUPPORTED_DB_NAMES) {
    const actual = byLower.get(cand)
    if (actual) return actual
  }
  return null
}

// Extract the file/folder path a shell launch passed in argv (after the executable).
// Skips Chromium/Electron flags (`--foo`, `-x`) and the dev `.` cwd argument.
export function firstPathArg(argsAfterExe: string[]): string | null {
  for (const a of argsAfterExe) {
    if (!a || a === '.' || a.startsWith('-')) continue
    return a
  }
  return null
}

// If `path` is a folder, resolve it to a supported thumbnail db inside it; otherwise return as-is.
export async function resolveDbPath(path: string): Promise<{ path: string } | { error: string }> {
  let st
  try {
    st = await stat(path)
  } catch (err) {
    return { error: `Could not open: ${(err as Error).message}` }
  }
  if (!st.isDirectory()) return { path }
  const name = pickDbName(await readdir(path))
  if (!name) return { error: 'No Thumbs.db / ehthumbs.db found in that folder.' }
  return { path: join(path, name) }
}
