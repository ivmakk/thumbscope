// Find embedded JPEG: scan to first SOI (`FF D8 FF`, handles MS thumbstream prefix),
// trim to the last EOI (`FF D9`) so trailing junk is dropped.
export function sliceJpeg(buf: Buffer): Buffer | null {
  let start = -1
  for (let i = 0; i + 2 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      start = i
      break
    }
  }
  if (start < 0) return null
  for (let j = buf.length - 1; j > start + 1; j--) {
    if (buf[j - 1] === 0xff && buf[j] === 0xd9) return buf.subarray(start, j + 1)
  }
  return buf.subarray(start)
}

// Decode width/height from a JPEG's first SOF marker.
export function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let i = 2 // skip SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    // standalone markers carry no length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    const len = (buf[i + 2] << 8) | buf[i + 3]
    // SOF0..SOF15 hold dimensions, except DHT(C4)/JPG(C8)/DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (buf[i + 5] << 8) | buf[i + 6]
      const width = (buf[i + 7] << 8) | buf[i + 8]
      return { width, height }
    }
    if (len < 2) break
    i += 2 + len
  }
  return null
}
