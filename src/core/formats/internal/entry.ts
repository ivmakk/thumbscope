// Internal seam: one place that turns a classified payload + its metadata into a ThumbEntry, filling
// width/height/size from the payload so every handler stops re-inlining the same dimension+push block.
// Not a handler interface — used by the container handlers and the carve path, tested through them.

import type { Payload, ThumbEntry } from '../../types.ts'
import { pngDimensions } from '../codec/png.ts'
import { jpegDimensions } from '../codec/jpeg.ts'

// Width/height for an entry: from a decoded DIB, a PNG's IHDR, else the JPEG/CMYK payload's SOF marker.
function payloadDimensions(payload: Payload): { width: number | null; height: number | null } {
  if (payload.kind === 'dib' || payload.kind === 'rgba') return { width: payload.width, height: payload.height }
  const d = payload.kind === 'png' ? pngDimensions(payload.data) : jpegDimensions(payload.data)
  return { width: d?.width ?? null, height: d?.height ?? null }
}

// Byte length reported as the entry `size`.
function payloadSize(payload: Payload): number {
  return payload.kind === 'dib' || payload.kind === 'rgba' ? payload.pixels.length : payload.data.length
}

export interface EntryFields {
  streamName: string
  index: number | null
  name: string | null
  label: string
  date: Date | null
  payload: Payload
}

export function makeEntry(f: EntryFields): ThumbEntry {
  const { width, height } = payloadDimensions(f.payload)
  return {
    index: f.index,
    streamName: f.streamName,
    name: f.name,
    label: f.label,
    date: f.date,
    width,
    height,
    size: payloadSize(f.payload),
    payload: f.payload
  }
}
