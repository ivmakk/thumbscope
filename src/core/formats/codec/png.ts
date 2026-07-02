// PNG 8-byte signature immediately followed by the IHDR chunk header (length 0x0000000D + 'IHDR').
// Matching all 16 bytes (not just the 8-byte signature) means a stray PNG signature inside JPEG entropy
// data can't trigger a false PNG route — a real PNG always opens with IHDR.
export const PNG_SIG_IHDR = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

// Find an embedded PNG: scan to the signature+IHDR (steps over the MS thumbstream prefix, like
// sliceJpeg skips to the SOI), slice to the buffer end (the PNG fills the stream). Null if absent.
export function slicePng(buf: Buffer): Buffer | null {
  const at = buf.indexOf(PNG_SIG_IHDR)
  return at < 0 ? null : buf.subarray(at)
}

// Decode width/height from a PNG's IHDR (width at sig+16, height at sig+20, big-endian). Bounds-checked
// like jpegDimensions/parseDib so a malformed IHDR yields null rather than a bogus dimension.
export function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const width = dv.getUint32(16, false)
  const height = dv.getUint32(20, false)
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) return null
  return { width, height }
}
