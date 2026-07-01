// Decode a complete BMP file (`BM` + BITMAPINFOHEADER, 24/32bpp) to tightly-packed top-down RGB —
// the same normalized form parseDib produces. IrfanView stores each thumbnail as a full BMP (unlike
// ehthumbs' raw DIB), so rows are padded to a 4-byte boundary and pixel data starts at the file's
// declared offset. Positive header height = bottom-up (the BMP norm), negative = top-down.
// Read + validate the shared `BM` prefix (BITMAPFILEHEADER + BITMAPINFOHEADER): magic, >=54 bytes,
// dibSize >= 40, 24/32bpp, sane dimensions. Returns null for anything malformed. Codec-specific policy
// (alpha masks, row stride, the pixel walk) stays with each caller. Exported so the carve scanner reuses
// the exact same validation instead of hand-keeping a third copy of these offsets/bounds.
export interface BmpHeader {
  dataOffset: number
  dibSize: number
  width: number
  height: number
  bpp: number
  bottomUp: boolean
}
export function readBmpHeader(buf: Buffer): BmpHeader | null {
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
  return { dataOffset, dibSize, width, height, bpp, bottomUp: heightRaw > 0 }
}

export function parseBmp(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
  const header = readBmpHeader(buf)
  if (!header) return null
  const { dataOffset, width, height, bpp, bottomUp } = header
  const channels = bpp / 8
  const stride = (width * channels + 3) & ~3 // BMP rows pad to 4 bytes
  if (dataOffset + stride * height > buf.length) return null

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

// Standard BGRA channel masks (blue in the low byte) - the only 32bpp layout we trust. Real thumbcache
// BMPs declare BI_BITFIELDS (compression 3) but carry exactly these masks.
const BGRA_MASKS = [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000]

// Decode a 32bpp `BM`-wrapped BITMAPV5HEADER bitmap (the small-bucket thumbcache payload) to tightly-
// packed top-down *straight* RGBA. Windows stores these premultiplied, so alpha<255 pixels are divided
// back out. Distinct from parseBmp (which yields opaque RGB for IrfanView) because this path keeps the
// alpha channel and only accepts standard BGRA masks. Returns null for anything it can't trust.
export function parseBmpRgba(buf: Buffer): { width: number; height: number; pixels: Buffer; hasAlpha: boolean } | null {
  const header = readBmpHeader(buf)
  if (!header || header.bpp !== 32) return null // this path is alpha-only; 24bpp stays on parseBmp
  const { dataOffset, width, height, bottomUp } = header
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const compression = dv.getUint32(30, true)
  // BI_BITFIELDS: masks live at dib+40 (file offset 54..69). Only standard BGRA is supported; reject the
  // rest rather than mis-order channels. BI_RGB (0) is implicitly BGRA. Bound-check first so a truncated
  // bitfields header returns null instead of throwing a RangeError on the mask reads.
  if (compression === 3) {
    if (buf.length < 70) return null
    const masks = [dv.getUint32(54, true), dv.getUint32(58, true), dv.getUint32(62, true), dv.getUint32(66, true)]
    if (masks.some((m, i) => m !== BGRA_MASKS[i])) return null
  } else if (compression !== 0) {
    return null // RLE / embedded JPEG or PNG not handled here
  }
  const stride = width * 4 // 32bpp rows are already 4-byte aligned
  if (dataOffset + stride * height > buf.length) return null

  const out = Buffer.alloc(width * height * 4)
  let anyAlpha = false
  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y
    let s = dataOffset + srcRow * stride
    let d = y * width * 4
    for (let x = 0; x < width; x++) {
      const a = buf[s + 3]
      out[d] = buf[s + 2] // R
      out[d + 1] = buf[s + 1] // G
      out[d + 2] = buf[s] // B
      out[d + 3] = a
      if (a !== 0) anyAlpha = true
      s += 4
      d += 4
    }
  }

  // A uniformly-zero alpha channel is unused padding, not a fully-transparent image - treat as opaque.
  if (!anyAlpha) {
    for (let i = 3; i < out.length; i += 4) out[i] = 0xff
    return { width, height, pixels: out, hasAlpha: false }
  }

  // Un-premultiply: straight = premultiplied * 255 / alpha (clamped). Fully-transparent pixels carry no
  // meaningful color - zero them. hasAlpha = any genuinely translucent pixel (a < 255): drives the
  // per-thumb transparency backdrop so opaque 32bpp images don't get a needless checkerboard.
  let hasAlpha = false
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3]
    if (a < 255) hasAlpha = true
    if (a === 0) {
      out[i] = out[i + 1] = out[i + 2] = 0
    } else if (a < 255) {
      out[i] = Math.min(255, Math.round((out[i] * 255) / a))
      out[i + 1] = Math.min(255, Math.round((out[i + 1] * 255) / a))
      out[i + 2] = Math.min(255, Math.round((out[i + 2] * 255) / a))
    }
  }
  return { width, height, pixels: out, hasAlpha }
}
