// Tier-2 recovery (the `recovered` variant). Not a ContainerHandler and not in the registry: the
// orchestrator calls carveFallback explicitly when the buffer is not OLE2, no handler matched, or the
// best handler parse returned zero entries. Carves raw payload runs from the whole buffer with no
// container metadata, so labels are positional only.

import type { Payload, ParseResult, ThumbEntry } from '../../types.ts'
import { PNG_SIG_IHDR } from '../codec/png.ts'
import { makeEntry } from '../internal/entry.ts'

const CARVE_MIN_BYTES = 256 // ignore tiny SOI..EOI runs (icons/EXIF noise) when recovering

// Scan a whole buffer for JPEG runs (SOI `FF D8 FF` .. EOI `FF D9`), non-overlapping. A run with no
// trailing EOI (truncated file) is kept from SOI to end so partial images still render.
function carveJpegs(buf: Buffer): Buffer[] {
  const out: Buffer[] = []
  let i = 0
  while (i + 2 < buf.length) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8 || buf[i + 2] !== 0xff) {
      i++
      continue
    }
    let end = -1
    for (let j = i + 3; j + 1 < buf.length; j++) {
      if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
        end = j + 2
        break
      }
    }
    if (end < 0) {
      if (buf.length - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i))
      break
    }
    if (end - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i, end))
    i = end
  }
  return out
}

// Scan a whole buffer for PNG runs (signature+IHDR .. end of the IEND chunk), non-overlapping. The end
// is found by walking the chunk chain (each chunk: u32be length + 4-byte type + data + u32 CRC) until
// the IEND chunk - a plain `indexOf('IEND')` would false-match those 4 bytes inside compressed IDAT data
// and truncate the slice. A run with no IEND (truncated file) is kept from the signature to end.
function carvePngs(buf: Buffer): Buffer[] {
  const out: Buffer[] = []
  let i = 0
  while ((i = buf.indexOf(PNG_SIG_IHDR, i)) >= 0) {
    let pos = i + 8 // first chunk (IHDR) starts right after the 8-byte signature
    let end = -1
    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos)
      const type = buf.toString('latin1', pos + 4, pos + 8)
      const next = pos + 12 + len // length(4) + type(4) + data(len) + CRC(4)
      if (type === 'IEND') {
        end = Math.min(next, buf.length)
        break
      }
      if (next > buf.length || next <= pos) break // truncated or malformed chunk
      pos = next
    }
    if (end < 0) {
      if (buf.length - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i)) // no IEND: keep to end
      break
    }
    if (end - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i, end))
    i = end
  }
  return out
}

// Build entries from raw-carved payloads. JPEG runs are carved first; if none survive, fall back to
// carving PNG runs (a damaged hashed-png file). No catalog, so labels are positional only.
export function carveFallback(fileBuffer: Buffer): ParseResult {
  const jpegs = carveJpegs(fileBuffer)
  const payloads: Payload[] = jpegs.length
    ? jpegs.map((data) => ({ kind: 'jpeg', data }))
    : carvePngs(fileBuffer).map((data) => ({ kind: 'png', data }))
  const entries: ThumbEntry[] = payloads.map((payload, i) =>
    makeEntry({ index: i + 1, streamName: `carved-${i + 1}`, name: null, label: `#${i + 1}`, date: null, payload })
  )
  return { count: entries.length, failed: 0, catalogCount: 0, entries, recovered: true, format: 'recovered' }
}
