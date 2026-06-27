// ehthumbs DIB. Header: u32 headerSize@0, *signed* i32 stride@8 (sign = row direction, abs = bytes
// per row), u32 width@12, u32 height@16. Pixels are 24bpp BGR or 32bpp BGRA (channels derived from
// stride). Normalizes to tightly-packed top-down RGB so display (BMP) and export (sharp) are uniform.
export function parseDib(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
  if (buf.length < 24) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const headerSize = dv.getUint32(0, true)
  if (headerSize < 24 || headerSize > buf.length) return null
  const strideSigned = dv.getInt32(8, true)
  const width = dv.getUint32(12, true)
  const height = dv.getUint32(16, true)
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) return null
  const stride = Math.abs(strideSigned)
  if (stride < width * 3) return null
  const channels = stride >= width * 4 ? 4 : 3
  const bottomUp = strideSigned < 0
  if (headerSize + stride * height > buf.length) return null

  const out = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y
    let s = headerSize + srcRow * stride
    let d = y * width * 3
    for (let x = 0; x < width; x++) {
      out[d] = buf[s + 2] // R
      out[d + 1] = buf[s + 1] // G
      out[d + 2] = buf[s] // B
      s += channels
      d += 3
    }
  }
  return { width, height, pixels: out }
}

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
