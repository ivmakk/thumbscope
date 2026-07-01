// thumbcache-cmmm: the Windows Explorer thumbnail cache (Vista..11). A flat, non-OLE2 `CMMM` container,
// so it never enters the CFB registry - the orchestrator routes it at the async/header tier by magic,
// alongside SQLite. 24-byte file header, then a run of self-delimiting `CMMM` cache entries up to
// `firstAvail` (the used size; buckets are pre-allocated, so file size >= firstAvail).
//
// Header field order shifts at format version 30: v20/21 put firstEntry@12/firstAvail@16; v30+ insert
// an empty field @12, moving them to @16/@20. No filenames exist in the format, so each entry is
// labeled by the hex of its 8-byte ThumbnailCacheId. The payload codec is routed by its own magic
// (`classifyThumbcache`): 32bpp BMP -> rgba (small buckets), PNG, or JPEG (large buckets).

import { constants as bufferConstants } from 'node:buffer'
import type { ParseResult, Payload, ThumbEntry } from '../../types.ts'
import { sliceJpeg } from '../codec/jpeg.ts'
import { slicePng } from '../codec/png.ts'
import { parseBmpRgba } from '../codec/bmp.ts'
import { makeEntry } from '../internal/entry.ts'

// This cut reads the whole cache into one buffer (true lazy/on-demand payloads are a deferred app-wide
// change). A pathologically large cache would overflow Buffer.alloc; refuse it up front with a clear
// message instead of crashing. Pure + injectable `max` so it is unit-tested without a multi-GB file.
export function assertOpenableSize(size: number, max: number = bufferConstants.MAX_LENGTH): void {
  if (size > max) {
    throw new Error(`thumbcache cache too large to open: ${size} bytes exceeds the ${max}-byte in-memory limit`)
  }
}

// Route a cache-entry payload by magic - NOT the shared classify() (which is ehthumbs-DIB-first and
// would misfire on a real `BM` file). Small buckets are 32bpp BMP (with alpha); large buckets are JPEG;
// PNG is possible on some builds. `BM` -> straight-RGBA (rejected if not a trusted 32bpp BGRA V5).
function classifyThumbcache(data: Buffer): Payload | null {
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) {
    const bmp = parseBmpRgba(data)
    return bmp ? { kind: 'rgba', width: bmp.width, height: bmp.height, pixels: bmp.pixels } : null
  }
  const png = slicePng(data)
  if (png) return { kind: 'png', data: png }
  const jpeg = sliceJpeg(data)
  if (jpeg) return { kind: 'jpeg', data: jpeg }
  return null
}

// Positive signature: `CMMM` at offset 0 (vs OLE2 `D0 CF 11 E0`, SQLite `SQLite format 3\0`).
export function detectThumbcache(header: Buffer): boolean {
  return header.length >= 4 && header.toString('ascii', 0, 4) === 'CMMM'
}

// The sibling index file (`thumbcache_idx.db`) is an `IMMM` container: a hash->bucket lookup table with
// NO image payloads. Detect it so the orchestrator can refuse cleanly rather than let tier-2 carve
// invent broken entries from stray JPEG/PNG byte runs inside the index. The 4-byte signature sits at
// offset 0 (documented layout) or offset 4 (observed on real Win10/11 idx files, behind a 4-byte field).
// Checked only after CMMM/SQLite fail, so it cannot shadow a real image container.
export function detectIndex(header: Buffer): boolean {
  return (
    (header.length >= 4 && header.toString('ascii', 0, 4) === 'IMMM') ||
    (header.length >= 8 && header.toString('ascii', 4, 8) === 'IMMM')
  )
}

// Per-version cache-entry field layout. The fixed header (before the id string) is 48 B on Win7 (v21),
// but 56 B on both Vista (v20) and Win8+ (v30+) - for different reasons:
//   - Vista (v20) inserts an 8-byte `Extension[4]` wchar field right after the hash, so the size fields
//     shift by 8 (idStrSize@24, paddingSize@28, dataSize@32).
//   - Win8+ (v30+) has no Extension (size fields stay at the Win7 offsets) but carries 8 unknown bytes
//     before the checksums, so its pre-id header is also 56 B.
// (Verified against real v20/v21/v32 samples + the dissect cstruct definitions.)
interface EntryLayout {
  fixed: number
  idStrSizeOff: number
  paddingSizeOff: number
  dataSizeOff: number
}
function entryLayout(version: number): EntryLayout {
  if (version === 20) return { fixed: 56, idStrSizeOff: 24, paddingSizeOff: 28, dataSizeOff: 32 }
  if (version >= 30) return { fixed: 56, idStrSizeOff: 16, paddingSizeOff: 20, dataSizeOff: 24 }
  return { fixed: 48, idStrSizeOff: 16, paddingSizeOff: 20, dataSizeOff: 24 } // Win7 (v21)
}

export function parseThumbcache(buffer: Buffer): ParseResult {
  // detectThumbcache matches on just the 4-byte `CMMM` magic, so a truncated/corrupt file can route here
  // with fewer than the 24 header bytes the field reads below need. Bail cleanly (never crash on
  // truncated input) - the orchestrator then falls through to tier-2 carve.
  if (buffer.length < 24) return { count: 0, failed: 0, catalogCount: 0, entries: [], recovered: false, format: 'thumbcache-cmmm' }
  const version = buffer.readUInt32LE(4)
  // v30+ shifted firstEntry/firstAvail by one u32 (empty field @12).
  const firstEntry = version >= 30 ? buffer.readUInt32LE(16) : buffer.readUInt32LE(12)
  const firstAvailRaw = version >= 30 ? buffer.readUInt32LE(20) : buffer.readUInt32LE(16)
  const end = Math.min(firstAvailRaw, buffer.length)
  const { fixed, idStrSizeOff, paddingSizeOff, dataSizeOff } = entryLayout(version)

  const entries: ThumbEntry[] = []
  const seen = new Map<string, number>() // hex hash -> times seen, for streamName dedupe
  let failed = 0
  let off = firstEntry
  while (off + fixed <= end) {
    const size = buffer.readUInt32LE(off + 4)
    // A plausible size is the only way to stride to the next entry; without it we can't continue. This
    // is also the natural stop when the walk reaches the zero-filled free space past the last entry.
    if (size < fixed || off + size > end) break

    if (buffer.toString('ascii', off, off + 4) !== 'CMMM') {
      failed++ // corrupt per-entry signature, but a strideable size: skip this one, keep walking
      off += size
      continue
    }

    const dataSize = buffer.readUInt32LE(off + dataSizeOff)
    if (dataSize === 0) {
      off += size // dataSize=0 shell-item placeholder (Recycle Bin / CLSID): walkable, no payload - skip
      continue
    }

    const hash = buffer.subarray(off + 8, off + 16)
    const idStrSize = buffer.readUInt32LE(off + idStrSizeOff)
    const paddingSize = buffer.readUInt32LE(off + paddingSizeOff)
    // Payload is located from idStrSize (varies), not a hardcoded per-version offset. idStrSize/paddingSize
    // are untrusted: if they push the payload past the entry's own declared extent (off+size) the fields
    // are corrupt - count it failed rather than silently slicing bytes from the next entry.
    const dataStart = off + fixed + idStrSize + paddingSize
    if (dataStart + dataSize > off + size) {
      failed++
      off += size
      continue
    }
    const data = buffer.subarray(dataStart, dataStart + dataSize)

    const payload = classifyThumbcache(data)
    if (payload) {
      const label = hash.toString('hex') // no filename in the format - hex ThumbnailCacheId is the label
      const dup = seen.get(label) ?? 0
      seen.set(label, dup + 1)
      const streamName = dup === 0 ? label : `${label}-${dup}` // dedupe-suffix on hash collision
      entries.push(makeEntry({ streamName, index: null, name: null, label, date: null, payload }))
    } else {
      failed++
    }
    off += size
  }

  return { count: entries.length, failed, catalogCount: 0, entries, recovered: false, format: 'thumbcache-cmmm' }
}
