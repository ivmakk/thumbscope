// The orchestrator: two tiers turn a file into a ParseResult.
//
//  - Async/path tier (`openThumbnailDb`): reads the 16-byte header and routes SQLite by path
//    (DatabaseSync opens a path, never the full buffer), else reads the buffer and runs the sync tier.
//  - Sync/buffer tier (`parseThumbsDb`): runs `CFB.read` once - throw => the bytes are not OLE2, go
//    straight to tier-2 carve; success => build a non-null `CfbCtx` and walk the registry (first
//    positive `detect` wins). Tier-2 carve runs when nothing matched or the best parse found zero.
//
// `parseThumbsDb(buffer)` is the sync core preserved as the compat entry the existing tests depend on.

import { open as fsOpen } from 'node:fs/promises'
import type { ContainerFormat, ParseResult } from '../types.ts'
import type { CfbCtx } from './types.ts'
import { readCfb } from './internal/cfbToolkit.ts'
import { carveFallback } from './container/carve.ts'
import { detectSqlite, parseSqlite } from './container/sqlite.ts'
import { detectThumbcache, detectIndex, parseThumbcache, assertOpenableSize } from './container/thumbcache.ts'
import { registry } from './registry.ts'

// Thrown when the input is not an OLE2/CFB compound file at all (vs. a parseable but corrupt one) and
// nothing could be carved. Lets the caller show a precise message instead of a cryptic cfb error.
export class NotCfbError extends Error {
  constructor() {
    super('Not an OLE2 compound file - Thumbs.db / ehthumbs.db files are compound (OLE2) files.')
    this.name = 'NotCfbError'
  }
}

// Thrown when the input is a thumbcache *index* (`thumbcache_idx.db`, IMMM): it maps thumbnail hashes to
// bucket files but stores no images, so there is nothing to render. A precise message points the user at
// the sibling image files instead of showing carve-invented broken thumbnails.
export class ThumbcacheIndexError extends Error {
  constructor() {
    super('This is a thumbcache index (thumbcache_idx.db) - it holds no thumbnails, only a lookup table. Open a sibling thumbcache_*.db (e.g. thumbcache_256.db) instead.')
    this.name = 'ThumbcacheIndexError'
  }
}

export interface OpenOptions {
  format?: string // force a registry handler by slug, skipping detection (manual override / debug)
}

// Sync core over a buffer. Compat entry preserved for the ~40 existing test call-sites.
export function parseThumbsDb(fileBuffer: Buffer, opts?: OpenOptions): ParseResult {
  let cfb: ReturnType<typeof readCfb>
  try {
    cfb = readCfb(fileBuffer)
  } catch {
    // Not an OLE2 container — recover raw payloads before giving up.
    const carved = carveFallback(fileBuffer)
    if (carved.count > 0) return carved
    throw new NotCfbError()
  }

  const ctx: CfbCtx = { path: '', header: fileBuffer.subarray(0, 16), buffer: fileBuffer, cfb }

  // {format} override forces a named handler and skips detection. An explicit override is exact: it
  // returns whatever the chosen handler produces, with no tier-2 carve fallback (carve stays on the
  // auto/detection path). This keeps the override useful for debugging - you see the handler's real
  // result, even when empty, instead of carved output silently masking it.
  if (opts?.format) {
    const forced = registry.find((h) => h.slug === opts.format)
    // Unknown slug is a caller error - fail loud rather than echo a bogus value back through the closed
    // ContainerFormat type. The auto/detection path below is the only one that carves.
    if (!forced) throw new Error(`Unknown --format handler "${opts.format}" (valid: ${registry.map((h) => h.slug).join(', ')})`)
    return forced.parse(ctx)
  }

  const handler = registry.find((h) => h.detect(ctx))
  if (!handler) return carveOr(fileBuffer, emptyResult('cfb'))
  const result = handler.parse(ctx)
  if (result.count === 0) return carveOr(fileBuffer, result)
  // Partial-failure rescue: when cfb can't walk a damaged chain it leaves streams blank (failed>0) while
  // the raw payloads survive in the buffer. If carving beats the handler, prefer the fuller carved set.
  // Gated to catalog-less formats so a named (catalog) file with a stray failed entry keeps its metadata.
  // carveFallback is JPEG-first, so it can only safely improve a JPEG-family result - skip a hashed-png
  // result, where a stray carved JPEG run could otherwise replace the real PNG payloads.
  if (result.failed > 0 && result.catalogCount === 0 && !result.entries.some((e) => e.payload.kind === 'png')) {
    const carved = carveFallback(fileBuffer)
    if (carved.count > result.count) return carved
  }
  return result
}

// Tier-2: carve the whole buffer; fall back to the given zero-entry result when nothing carves.
function carveOr(fileBuffer: Buffer, zero: ParseResult): ParseResult {
  const carved = carveFallback(fileBuffer)
  return carved.count > 0 ? carved : zero
}

function emptyResult(format: ContainerFormat): ParseResult {
  return { count: 0, failed: 0, catalogCount: 0, entries: [], recovered: false, format }
}

// Async/path tier. Routes SQLite by header (path-based read, never loads the full buffer for the magic
// check), else reads the buffer and runs the sync core.
export async function openThumbnailDb(path: string, opts?: OpenOptions): Promise<ParseResult> {
  const fh = await fsOpen(path, 'r')
  try {
    const header = Buffer.alloc(16)
    const { bytesRead } = await fh.read(header, 0, 16, 0)
    // SQLite is auto-routed by path (DatabaseSync reopens it) so the full buffer is never loaded for it -
    // but a {format} override means "skip detection", so it bypasses the header route and runs the
    // buffer tier (sqlite-photothumb is path-tier, not a forceable buffer handler).
    const magic = bytesRead < 16 ? header.subarray(0, bytesRead) : header
    if (!opts?.format && detectSqlite(magic)) {
      return parseSqlite(path)
    }
    // thumbcache-cmmm: also header-detected (flat `CMMM`, not OLE2), so it joins the async tier rather
    // than the CFB registry. Read-at-once for now, so refuse a cache too large to buffer before alloc.
    if (!opts?.format && detectThumbcache(magic)) {
      assertOpenableSize((await fh.stat()).size)
      const buf = await fh.readFile()
      const result = parseThumbcache(buf)
      // No live entries carried a payload (only placeholders): the real thumbnails may survive as
      // complete images in the pre-allocated free space. Carve them, same as the CFB zero-entry path.
      if (result.count === 0) return carveOr(buf, result)
      return result
    }
    // The sibling IMMM index (`thumbcache_idx.db`) has no image payloads - refuse it here rather than let
    // the OLE2/carve fallback recover stray byte runs as broken thumbnails. No extra IO: the 16-byte
    // header is already read, and this skips the whole-file read the carve path would otherwise do.
    if (!opts?.format && detectIndex(magic)) {
      throw new ThumbcacheIndexError()
    }
    // OLE2: read the whole file from the same handle (the positional header read left the position at 0),
    // avoiding a second open/read of the same file.
    return parseThumbsDb(await fh.readFile(), opts)
  } finally {
    await fh.close()
  }
}
