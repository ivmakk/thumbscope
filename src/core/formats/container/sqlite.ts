// SQLite-backed cache router (sqlite-photothumb). Not a ContainerHandler: SQLite is detected by the
// 16-byte file header and read by *path* (node:sqlite's DatabaseSync opens a path, not a buffer), so it
// lives at the orchestrator's async/path tier rather than in the sync buffer registry. The actual table
// read stays in photothumb.ts; this is the thin seam the orchestrator routes through.

import type { ParseResult } from '../../types.ts'
import { isSqlite, parsePhotothumb } from '../../photothumb.ts'

// Positive signature on the first 16 bytes ("SQLite format 3\0").
export function detectSqlite(header: Buffer): boolean {
  return isSqlite(header)
}

export function parseSqlite(path: string): ParseResult {
  return parsePhotothumb(path)
}
