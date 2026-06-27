import type { Payload } from '../../types.ts'
import { parseDib } from './dib.ts'
import { slicePng } from './png.ts'
import { sliceJpeg } from './jpeg.ts'
import { isAbbrevJpeg, reconstructAbbrevJpeg } from './abbrevJpeg.ts'

// Route a stream's bytes to a payload by signature. DIB first (strict header), then PNG, then JPEG. PNG
// must precede JPEG because a PNG's compressed body can incidentally contain `FF D8 FF`, which sliceJpeg
// would mis-slice. A abbrev-jpeg JPEG (headerless XP CMYK) is reconstructed into a `abbrev-jpeg` payload
// that decodeAbbrevRgb later renders to RGB; on reconstruction failure it falls back to the raw bytes so
// the entry still lists.
export function classify(content: Buffer): Payload | null {
  const dib = parseDib(content)
  if (dib) return { kind: 'dib', width: dib.width, height: dib.height, pixels: dib.pixels }
  const png = slicePng(content)
  if (png) return { kind: 'png', data: png }
  const jpeg = sliceJpeg(content)
  if (jpeg) {
    if (isAbbrevJpeg(jpeg)) {
      const recon = reconstructAbbrevJpeg(jpeg)
      if (recon) return { kind: 'abbrev-jpeg', data: recon }
    }
    return { kind: 'jpeg', data: jpeg }
  }
  return null
}
