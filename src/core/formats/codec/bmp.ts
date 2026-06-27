// Decode a complete BMP file (`BM` + BITMAPINFOHEADER, 24/32bpp) to tightly-packed top-down RGB —
// the same normalized form parseDib produces. IrfanView stores each thumbnail as a full BMP (unlike
// ehthumbs' raw DIB), so rows are padded to a 4-byte boundary and pixel data starts at the file's
// declared offset. Positive header height = bottom-up (the BMP norm), negative = top-down.
export function parseBmp(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null // 'BM'
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const dataOffset = dv.getUint32(10, true)
  const dibSize = dv.getUint32(14, true)
  if (dibSize < 40) return null // need a BITMAPINFOHEADER
  const width = dv.getInt32(18, true)
  const heightRaw = dv.getInt32(22, true)
  const bpp = dv.getUint16(28, true)
  if (width <= 0 || width > 20000) return null
  const height = Math.abs(heightRaw)
  if (height <= 0 || height > 20000) return null
  if (bpp !== 24 && bpp !== 32) return null
  const channels = bpp / 8
  const stride = (width * channels + 3) & ~3 // BMP rows pad to 4 bytes
  if (dataOffset + stride * height > buf.length) return null
  const bottomUp = heightRaw > 0

  const out = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y
    let s = dataOffset + srcRow * stride
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
