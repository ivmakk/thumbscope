// Baseline (SOF0) JPEG decoder that returns raw component samples, used only for Windows XP "abbrev-jpeg"
// thumbnails. These are abbreviated 4-component JPEGs whose pixels are RGB stored in reversed channel
// order with an unused 4th plane; the correct rendering (matching the reference thumbsviewer tool) is a
// plain reversed copy of the first three components — R=c2, G=c1, B=c0, no complement — with the fourth
// (K) component ignored and the image flipped vertically (it is stored bottom-up). General CMYK->RGB
// via sharp/lcms does not reproduce this: it applies the K channel (forcing near-black) and a colour
// profile (a warm cast), so we decode the components ourselves and map them directly.
//
// Scope: the OS encoder emits a single rigid shape — baseline, 8-bit, four components at 1x1 sampling,
// no restart intervals (verified across a large real corpus). Subsampled frames are rejected; the
// caller falls back to listing the entry without an image.

// JPEG natural (raster) position for each coefficient in zig-zag scan order.
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
  28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63
]

// Precomputed separable IDCT basis: M[x*8+u] = C(u) * cos((2x+1)*u*pi/16), C(0)=1/sqrt2 else 1.
const IDCT_M = (() => {
  const m = new Float64Array(64)
  for (let x = 0; x < 8; x++) {
    for (let u = 0; u < 8; u++) {
      const c = u === 0 ? Math.SQRT1_2 : 1
      m[x * 8 + u] = c * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
    }
  }
  return m
})()

interface Huff {
  // key = (codeLength * 65536 + code) -> symbol value
  lut: Map<number, number>
}

// Build a canonical Huffman decode table from JPEG DHT data (counts per length 1..16 + symbols).
function buildHuff(counts: number[], symbols: number[]): Huff {
  const lut = new Map<number, number>()
  let code = 0
  let k = 0
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) {
      lut.set(len * 65536 + code, symbols[k++])
      code++
    }
    code <<= 1
  }
  return { lut }
}

// MSB-first bit reader over JPEG entropy-coded data, undoing 0xFF00 byte stuffing and stopping at any
// marker (e.g. EOI). Reads past the end return 0 bits.
class BitReader {
  private data: Uint8Array
  private p: number
  private readonly end: number
  private buf = 0
  private cnt = 0
  private done = false
  constructor(data: Uint8Array, start: number, end: number) {
    this.data = data
    this.p = start
    this.end = end
  }
  private fill(): void {
    if (this.cnt > 0) return
    if (this.p >= this.end || this.done) {
      this.buf = 0
      this.cnt = 8
      return
    }
    let b = this.data[this.p++]
    if (b === 0xff) {
      const next = this.data[this.p]
      if (next === 0x00) this.p++
      else {
        this.done = true
        b = 0
      }
    }
    this.buf = b
    this.cnt = 8
  }
  bit(): number {
    this.fill()
    this.cnt--
    return (this.buf >> this.cnt) & 1
  }
  bits(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) v = (v << 1) | this.bit()
    return v
  }
  decode(h: Huff): number {
    let code = 0
    for (let len = 1; len <= 16; len++) {
      code = (code << 1) | this.bit()
      const v = h.lut.get(len * 65536 + code)
      if (v !== undefined) return v
    }
    return 0
  }
}

// Sign-extend an n-bit JPEG amplitude (magnitude category) to a signed value.
function extend(v: number, n: number): number {
  return v < 1 << (n - 1) ? v - (1 << n) + 1 : v
}

// Reusable IDCT scratch (decode is single-threaded synchronous, so one shared buffer is safe).
const IDCT_TMP = new Float64Array(64)

// Inverse 8x8 DCT of dequantized coefficients -> level-shifted samples (0..255) in `out`.
function idct(block: Float64Array, out: Uint8Array): void {
  const tmp = IDCT_TMP
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let s = 0
      for (let u = 0; u < 8; u++) s += block[y * 8 + u] * IDCT_M[x * 8 + u]
      tmp[y * 8 + x] = s / 2
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0
      for (let v = 0; v < 8; v++) s += tmp[v * 8 + x] * IDCT_M[y * 8 + v]
      const val = Math.round(s / 2) + 128
      out[y * 8 + x] = val < 0 ? 0 : val > 255 ? 255 : val
    }
  }
}

interface Component {
  id: number
  hi: number
  vi: number
  tq: number
}

// Decode a abbrev-jpeg reconstructed JPEG to upright, tightly-packed top-down RGB. Throws on anything
// outside the expected baseline / 1x1-sampling shape so the caller can fall back.
export function decodeAbbrevRgb(jpeg: Buffer): { width: number; height: number; pixels: Buffer } {
  const data = jpeg
  const qt: Record<number, Int32Array> = {}
  const hdc: Record<number, Huff> = {}
  const hac: Record<number, Huff> = {}
  let frame: { w: number; h: number; comps: Component[] } | null = null
  let scan: { sel: { id: number; td: number; ta: number }[]; start: number } | null = null

  let i = 2 // skip SOI
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff) {
      i++
      continue
    }
    const marker = data[i + 1]
    i += 2
    if (marker === 0xd9) break // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue // standalone
    const len = (data[i] << 8) | data[i + 1]
    const seg = i + 2
    const segEnd = i + len
    if (len < 2 || segEnd > data.length) throw new Error('abbrev-jpeg decode: segment length exceeds buffer')
    if (marker === 0xdb) {
      // DQT (may carry multiple tables)
      let p = seg
      while (p < segEnd) {
        const pq = data[p] >> 4
        const tq = data[p] & 15
        p++
        const t = new Int32Array(64)
        for (let k = 0; k < 64; k++) {
          t[ZIGZAG[k]] = pq ? (data[p] << 8) | data[p + 1] : data[p]
          p += pq ? 2 : 1
        }
        qt[tq] = t
      }
    } else if (marker === 0xc0) {
      // SOF0 baseline, 8-bit only (abbrev-jpeg streams are always this shape)
      if (data[seg] !== 8) throw new Error('abbrev-jpeg decode: only 8-bit sample precision supported')
      const h = (data[seg + 1] << 8) | data[seg + 2]
      const w = (data[seg + 3] << 8) | data[seg + 4]
      const nc = data[seg + 5]
      const comps: Component[] = []
      let p = seg + 6
      for (let c = 0; c < nc; c++) {
        comps.push({ id: data[p], hi: data[p + 1] >> 4, vi: data[p + 1] & 15, tq: data[p + 2] })
        p += 3
      }
      frame = { w, h, comps }
    } else if (marker === 0xc4) {
      // DHT (may carry multiple tables)
      let p = seg
      while (p < segEnd) {
        const tc = data[p] >> 4
        const th = data[p] & 15
        p++
        const counts: number[] = []
        let total = 0
        for (let l = 0; l < 16; l++) {
          counts.push(data[p + l])
          total += data[p + l]
        }
        p += 16
        const symbols: number[] = []
        for (let s = 0; s < total; s++) symbols.push(data[p + s])
        p += total
        const hh = buildHuff(counts, symbols)
        if (tc === 0) hdc[th] = hh
        else hac[th] = hh
      }
    } else if (marker === 0xda) {
      // SOS
      const ns = data[seg]
      const sel: { id: number; td: number; ta: number }[] = []
      let p = seg + 1
      for (let s = 0; s < ns; s++) {
        sel.push({ id: data[p], td: data[p + 1] >> 4, ta: data[p + 1] & 15 })
        p += 2
      }
      scan = { sel, start: segEnd }
      break
    }
    i = segEnd
  }

  if (!frame || !scan) throw new Error('abbrev-jpeg decode: missing frame or scan')
  const { w, h, comps } = frame
  if (w <= 0 || h <= 0 || w > 20000 || h > 20000) throw new Error('abbrev-jpeg decode: bad dimensions')
  if (comps.some((c) => c.hi !== 1 || c.vi !== 1)) throw new Error('abbrev-jpeg decode: subsampling unsupported')
  if (comps.length < 3) throw new Error('abbrev-jpeg decode: need at least 3 components')

  const planes = comps.map(() => new Uint8Array(w * h))
  const order = scan.sel.map((s) => comps.findIndex((c) => c.id === s.id))
  const br = new BitReader(data, scan.start, data.length)
  const pred = new Array(comps.length).fill(0)
  const coef = new Float64Array(64)
  const out = new Uint8Array(64)
  const mcuCols = Math.ceil(w / 8)
  const mcuRows = Math.ceil(h / 8)

  for (let my = 0; my < mcuRows; my++) {
    for (let mx = 0; mx < mcuCols; mx++) {
      for (let n = 0; n < scan.sel.length; n++) {
        const ci = order[n]
        if (ci < 0) throw new Error('abbrev-jpeg decode: scan component not in frame')
        const sel = scan.sel[n]
        const comp = comps[ci]
        const dcTable = hdc[sel.td]
        const acTable = hac[sel.ta]
        const q = qt[comp.tq]
        if (!dcTable || !acTable || !q) throw new Error('abbrev-jpeg decode: missing table')
        coef.fill(0)
        const t = br.decode(dcTable)
        const diff = t ? extend(br.bits(t), t) : 0
        pred[ci] += diff
        coef[0] = pred[ci] * q[0]
        let k = 1
        while (k < 64) {
          const rs = br.decode(acTable)
          const r = rs >> 4
          const s = rs & 15
          if (s === 0) {
            if (r === 15) {
              k += 16
              continue
            }
            break // EOB
          }
          k += r
          if (k > 63) break
          const pos = ZIGZAG[k]
          coef[pos] = extend(br.bits(s), s) * q[pos]
          k++
        }
        // The 4th (K) component is never read in the RGB mapping; its entropy is decoded above to keep
        // the bitstream aligned, but skip the IDCT and plane write for it.
        if (ci < 3) {
          idct(coef, out)
          const bx = mx * 8
          const by = my * 8
          const plane = planes[ci]
          for (let yy = 0; yy < 8; yy++) {
            const py = by + yy
            if (py >= h) break
            for (let xx = 0; xx < 8; xx++) {
              const px = bx + xx
              if (px >= w) continue
              plane[py * w + px] = out[yy * 8 + xx]
            }
          }
        }
      }
    }
  }

  // The four SOF components (tagged R,G,B,A) hold raw 8-bit samples; the image is RGB stored in
  // reversed channel order with an unused 4th plane. Map R=c2, G=c1, B=c0 (matching how Windows GDI+
  // reads these as 32bppCMYK and thumbsviewer complements them — the two inversions cancel to a plain
  // reversed copy, verified ±1 against GDI+ on real XP samples). The 4th plane is ignored; storage is
  // bottom-up, so flip vertically into upright RGB.
  const [p0, p1, p2] = planes
  const pixels = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    const dy = h - 1 - y
    for (let x = 0; x < w; x++) {
      const s = y * w + x
      const d = (dy * w + x) * 3
      pixels[d] = p2[s] // R
      pixels[d + 1] = p1[s] // G
      pixels[d + 2] = p0[s] // B
    }
  }
  return { width: w, height: h, pixels }
}
