import type { Payload } from './types'

// Wrap tightly-packed top-down RGB pixels (as produced by the DIB parser) in a 24bpp BMP so a browser
// <img> can render them. BMP stores BGR, bottom-up, with rows padded to a 4-byte boundary.
export function dibToBmp(width: number, height: number, pixels: Buffer): Buffer {
  const srcRow = width * 3
  const dstRow = (srcRow + 3) & ~3
  const imgSize = dstRow * height
  const buf = Buffer.alloc(54 + imgSize)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(54, 10) // pixel data offset
  buf.writeUInt32LE(40, 14) // BITMAPINFOHEADER size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // positive => bottom-up
  buf.writeUInt16LE(1, 26) // planes
  buf.writeUInt16LE(24, 28) // bits per pixel
  buf.writeUInt32LE(imgSize, 34)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y // top-down source -> bottom-up BMP
    let s = srcY * srcRow
    let d = 54 + y * dstRow
    for (let x = 0; x < width; x++) {
      buf[d] = pixels[s + 2] // B
      buf[d + 1] = pixels[s + 1] // G
      buf[d + 2] = pixels[s] // R
      s += 3
      d += 3
    }
  }
  return buf
}

// A renderable image buffer + MIME type for a parsed payload. `cmyk` payloads (reconstructed Type 1)
// need decodeType1Rgb + a sharp wrap (async, Node-only), so they're handled by the caller (get-image /
// export via renderCmyk), not here — keeping this module sync and sharp-free.
export function payloadToImage(payload: Payload): { mime: string; data: Buffer } {
  if (payload.kind === 'jpeg') return { mime: 'image/jpeg', data: payload.data }
  if (payload.kind === 'dib') return { mime: 'image/bmp', data: dibToBmp(payload.width, payload.height, payload.pixels) }
  throw new Error('cmyk payload requires async decode (use renderCmyk / decodeType1Rgb)')
}
