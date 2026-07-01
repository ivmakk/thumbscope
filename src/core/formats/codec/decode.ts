// Node-only (sharp). Total decode seam: turn any parsed payload into renderable bytes + a MIME type.
// Unlike the old sync payloadToImage, this is async and total over every payload kind including
// `abbrev-jpeg` (decoded via our own baseline decoder + a sharp raw->PNG wrap), so callers (the
// `thumb://` protocol handler / export) no longer special-case abbrev. JPEG/PNG pass through; DIB wraps as a BMP.

import sharp from 'sharp'
import type { Payload } from '../../types.ts'
import { dibToBmp } from './dib.ts'
import { decodeAbbrevRgb } from './abbrevJpeg.ts'

export async function decode(payload: Payload): Promise<{ mime: string; bytes: Buffer }> {
  if (payload.kind === 'jpeg') return { mime: 'image/jpeg', bytes: payload.data }
  if (payload.kind === 'png') return { mime: 'image/png', bytes: payload.data }
  if (payload.kind === 'dib') {
    return { mime: 'image/bmp', bytes: dibToBmp(payload.width, payload.height, payload.pixels) }
  }
  if (payload.kind === 'rgba') {
    // Straight RGBA -> PNG so the browser renders the alpha channel (BMP can't carry it losslessly here).
    const bytes = await sharp(payload.pixels, { raw: { width: payload.width, height: payload.height, channels: 4 } })
      .png()
      .toBuffer()
    return { mime: 'image/png', bytes }
  }
  // abbrev-jpeg: our decoder yields upright packed RGB (reversed-channel copy, no complement, K ignored,
  // already flipped), so sharp just ingests raw RGB and emits a browser-displayable PNG.
  const rgb = decodeAbbrevRgb(payload.data)
  const bytes = await sharp(rgb.pixels, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    .png()
    .toBuffer()
  return { mime: 'image/png', bytes }
}
