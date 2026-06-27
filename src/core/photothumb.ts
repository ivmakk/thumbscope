// SQLite-backed thumbnail cache (`photothumb.db`, written by PhotoScape). Unlike Thumbs.db this is not an OLE2
// container but a SQLite 3 database: a single `thumb(fname, tcreate, tmodify, fsize, width, height,
// image)` table whose `image` blob is a complete JFIF JPEG. Read with Node's built-in `node:sqlite`
// (zero deps). DatabaseSync opens a path, not a buffer, so parsePhotothumb takes the file path; the
// orchestrator (formats/open.ts) header-routes to it via container/sqlite.ts (detectSqlite/parseSqlite)
// — reading just the 16-byte header so the OLE2 path isn't loaded into memory for a magic check.
import { DatabaseSync } from 'node:sqlite'
import type { ParseResult, ThumbEntry } from './types'
import { jpegDimensions, sliceJpeg } from './formats/codec/jpeg.ts'

// "SQLite format 3\0" — the fixed 16-byte header every SQLite 3 file starts with.
const SQLITE_MAGIC = Buffer.from('53514c69746520666f726d6174203300', 'hex')

export function isSqlite(buf: Buffer): boolean {
  return buf.length >= 16 && buf.subarray(0, 16).equals(SQLITE_MAGIC)
}

interface ThumbRow {
  fname: string | null
  tmodify: number | null
  image: Uint8Array | null
}

// tmodify is the original file's mtime in Unix seconds (matches the catalog-date semantics of
// classic Thumbs.db: the original file's date, not the cache write time which sits in tcreate).
// `== null` (not `!s`) so a legitimate epoch timestamp (tmodify === 0) isn't dropped as "no date".
function unixSecondsToDate(s: number | null): Date | null {
  if (s == null) return null
  return new Date(s * 1000)
}

// Parse a PhotoScape photothumb.db by path. Throws a clear error when the database isn't the expected
// shape (caller shows it as an open error); never throws on a single bad row — skip-and-log instead.
export function parsePhotothumb(path: string): ParseResult {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    let stmt
    try {
      // prepare() compiles the SQL, so both "not photothumb" cases — a missing `thumb` table and
      // missing columns — throw here. Genuine SQLite failures (a corrupt b-tree, a locked file) are
      // rethrown as-is below so the user sees the real cause rather than a misleading "wrong schema".
      stmt = db.prepare('SELECT fname, tmodify, image FROM thumb')
    } catch (err) {
      const msg = (err as Error).message || ''
      if (/no such (table|column)/i.test(msg)) {
        throw new Error('Unrecognized SQLite database: expected a PhotoScape photothumb.db with a "thumb" table (fname, tmodify, image columns).')
      }
      throw err
    }

    // fname is the table's primary key, but SQLite allows NULL in a non-INTEGER PK and a foreign/
    // malformed table may repeat names — so don't trust it for the per-stream Map key. Synthesize a
    // unique streamName, falling back to a positional id when the name is missing/duplicated.
    const seen = new Set<string>()
    const entries: ThumbEntry[] = []
    let failed = 0
    let i = 0
    // iterate() streams rows one at a time, so only the current image blob is materialized rather
    // than every blob at once (as .all() would).
    for (const row of stmt.iterate() as Iterable<ThumbRow>) {
      const n = i++ // positional fallback id, stable across the skip path
      const blob = row.image ? Buffer.from(row.image) : null
      const jpeg = blob && sliceJpeg(blob)
      if (!jpeg) {
        failed++ // missing/short blob or no JPEG SOI — list nothing for this row
        continue
      }
      const dims = jpegDimensions(jpeg)
      const fname = typeof row.fname === 'string' ? row.fname : ''
      let streamName = fname || `row-${n + 1}`
      if (seen.has(streamName)) streamName = `${streamName}#${n + 1}` // keep the Map key unique
      seen.add(streamName)
      entries.push({
        index: null,
        streamName,
        name: fname || null,
        label: fname || `#${n + 1}`,
        date: unixSecondsToDate(row.tmodify),
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        size: jpeg.length,
        payload: { kind: 'jpeg', data: jpeg }
      })
    }

    entries.sort((a, b) => a.streamName.localeCompare(b.streamName))
    return { count: entries.length, failed, catalogCount: 0, entries, recovered: false, format: 'sqlite-photothumb' }
  } finally {
    db.close()
  }
}
