// Baseline JPEG encoder that produces a Windows XP "abbrev-jpeg" thumbnail stream — the inverse of
// src/core/formats/codec/abbrevJpeg.ts. Used only by the sample generator (scripts/make-sample-thumbsdb.mjs) to
// build a committed, photo-realistic sample/Thumbs-winxp.db; it is not part of the shipped app.
//
// Output shape matches a real XP stream: SOI + SOF0 (four components tagged R,G,B,A, all 1x1, all
// referencing quant table 0) + SOS + entropy + EOI, with NO DQT and NO DHT segments (Windows omits
// them; the parser's reconstructAbbrevJpeg re-adds the exact same tables). So an image encoded here
// round-trips back through decodeAbbrevRgb.
//
// Colour is the inverse of the decoder's transform (decode maps R=c2, G=c1, B=c0): per pixel
// component0=B, component1=G, component2=R (raw, no complement), and the 4th component is a constant 0
// (the decoder ignores it). The image is stored bottom-up (the decoder flips vertically), so JPEG
// raster row y holds source row (h-1-y).
//
// The quant + Huffman tables below mirror ABBREV_DQT / ABBREV_HUFFMAN in src/core/formats/codec/abbrevJpeg.ts (standard
// JPEG Annex-K tables — not copyrightable); they are duplicated so this script stays self-contained.

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
  28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63
]

// Separable DCT basis: M[x*8+u] = C(u) * cos((2x+1)*u*pi/16), C(0)=1/sqrt2 else 1. Same matrix the
// decoder's IDCT uses; the forward transform is its mathematical inverse with a 1/4 normalization.
const M = (() => {
  const m = new Float64Array(64)
  for (let x = 0; x < 8; x++) {
    for (let u = 0; u < 8; u++) {
      const c = u === 0 ? Math.SQRT1_2 : 1
      m[x * 8 + u] = c * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
    }
  }
  return m
})()

const ABBREV_DQT_HEX =
  'ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232'
const ABBREV_HUFFMAN_HEX =
  'ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa'

// Quant table 0 in natural (raster) order, un-zig-zagged from the DQT segment the parser re-adds.
const QT = (() => {
  const b = Buffer.from(ABBREV_DQT_HEX, 'hex')
  // first table: skip FF DB len(2) Pq/Tq(1) = 5 bytes, then 64 zig-zag values
  const zz = b.subarray(5, 5 + 64)
  const t = new Float64Array(64)
  for (let k = 0; k < 64; k++) t[ZIGZAG[k]] = zz[k]
  return t
})()

// Build symbol -> {code, len} encode maps for the DC (tc 0) and AC (tc 1) luminance tables from the
// shared DHT blob, using the canonical (counts-per-length + symbols) Huffman code assignment.
function buildEncodeTables() {
  const b = Buffer.from(ABBREV_HUFFMAN_HEX, 'hex')
  const tables = { dc: new Map(), ac: new Map() }
  let i = 0
  while (i < b.length) {
    // each segment: FF C4 len(2) then [Tc/Th(1) counts(16) symbols(total)]
    const len = (b[i + 2] << 8) | b[i + 3]
    let p = i + 4
    const end = i + 2 + len
    while (p < end) {
      const tc = b[p] >> 4
      p++
      const counts = []
      let total = 0
      for (let l = 0; l < 16; l++) {
        counts.push(b[p + l])
        total += b[p + l]
      }
      p += 16
      const symbols = []
      for (let s = 0; s < total; s++) symbols.push(b[p + s])
      p += total
      const map = new Map()
      let code = 0
      let k = 0
      for (let l = 1; l <= 16; l++) {
        for (let n = 0; n < counts[l - 1]; n++) {
          map.set(symbols[k++], { code, len: l })
          code++
        }
        code <<= 1
      }
      if (tc === 0) tables.dc = map
      else tables.ac = map
    }
    i = end
  }
  return tables
}
const { dc: DC_ENC, ac: AC_ENC } = buildEncodeTables()

// Forward 8x8 DCT of level-shifted samples -> coefficients in natural order.
function fdct(s, out) {
  const g = new Float64Array(64)
  for (let u = 0; u < 8; u++) {
    for (let j = 0; j < 8; j++) {
      let acc = 0
      for (let i = 0; i < 8; i++) acc += s[i * 8 + j] * M[i * 8 + u]
      g[u * 8 + j] = acc
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let acc = 0
      for (let j = 0; j < 8; j++) acc += g[u * 8 + j] * M[j * 8 + v]
      out[u * 8 + v] = 0.25 * acc
    }
  }
}

// MSB-first bit writer with 0xFF byte stuffing.
class BitWriter {
  constructor() {
    this.bytes = []
    this.cur = 0
    this.n = 0
  }
  put(code, len) {
    for (let i = len - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((code >> i) & 1)
      if (++this.n === 8) {
        this.bytes.push(this.cur)
        if (this.cur === 0xff) this.bytes.push(0x00)
        this.cur = 0
        this.n = 0
      }
    }
  }
  finish() {
    if (this.n > 0) {
      this.cur = (this.cur << (8 - this.n)) | ((1 << (8 - this.n)) - 1) // pad with 1s
      this.bytes.push(this.cur)
      if (this.cur === 0xff) this.bytes.push(0x00)
    }
    return Buffer.from(this.bytes)
  }
}

function category(v) {
  let a = Math.abs(v)
  let c = 0
  while (a) {
    c++
    a >>= 1
  }
  return c
}

// Amplitude bits for a signed coefficient of the given magnitude category.
function amplitude(v, size) {
  return v < 0 ? v + (1 << size) - 1 : v
}

// Encode one 8x8 block (natural-order quantized coefficients in `q`) into the bit stream. Returns the
// new DC predictor for this component.
function encodeBlock(bw, q, pred) {
  // DC
  const diff = q[0] - pred
  const dsize = category(diff)
  const dc = DC_ENC.get(dsize)
  bw.put(dc.code, dc.len)
  if (dsize > 0) bw.put(amplitude(diff, dsize), dsize)
  // AC, zig-zag order
  let run = 0
  for (let k = 1; k < 64; k++) {
    const v = q[ZIGZAG[k]]
    if (v === 0) {
      run++
      continue
    }
    while (run > 15) {
      const zrl = AC_ENC.get(0xf0)
      bw.put(zrl.code, zrl.len)
      run -= 16
    }
    const size = category(v)
    const sym = (run << 4) | size
    const ac = AC_ENC.get(sym)
    bw.put(ac.code, ac.len)
    bw.put(amplitude(v, size), size)
    run = 0
  }
  if (run > 0) {
    const eob = AC_ENC.get(0x00)
    bw.put(eob.code, eob.len)
  }
  return q[0]
}

// Encode packed top-down RGB (w*h*3) into an abbreviated XP abbrev-jpeg thumbnail stream.
export function encodeAbbrevJpeg(rgb, w, h) {
  const mcuCols = Math.ceil(w / 8)
  const mcuRows = Math.ceil(h / 8)
  // Four component planes: component0=B, component1=G, component2=R (raw), component3=0 (ignored on
  // decode). Stored bottom-up. Matches the decoder's R=c2, G=c1, B=c0 mapping.
  const COMP_TO_RGB = [2, 1, 0] // component index -> source RGB channel offset
  const sample = (comp, sy, sx) => {
    const px = Math.min(sx, w - 1)
    const py = Math.min(sy, h - 1)
    const srcRow = h - 1 - py // bottom-up storage
    const o = (srcRow * w + px) * 3
    if (comp === 3) return 0
    return rgb[o + COMP_TO_RGB[comp]]
  }

  const bw = new BitWriter()
  const pred = [0, 0, 0, 0]
  const block = new Float64Array(64)
  const coef = new Float64Array(64)
  const q = new Int32Array(64)
  for (let my = 0; my < mcuRows; my++) {
    for (let mx = 0; mx < mcuCols; mx++) {
      for (let comp = 0; comp < 4; comp++) {
        for (let yy = 0; yy < 8; yy++) {
          for (let xx = 0; xx < 8; xx++) {
            block[yy * 8 + xx] = sample(comp, my * 8 + yy, mx * 8 + xx) - 128
          }
        }
        fdct(block, coef)
        for (let k = 0; k < 64; k++) q[k] = Math.round(coef[k] / QT[k])
        pred[comp] = encodeBlock(bw, q, pred[comp])
      }
    }
  }

  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x14, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x04,
    0x52, 0x11, 0x00, 0x47, 0x11, 0x00, 0x42, 0x11, 0x00, 0x41, 0x11, 0x00
  ])
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0e, 0x04, 0x52, 0x00, 0x47, 0x00, 0x42, 0x00, 0x41, 0x00, 0x00, 0x3f, 0x00])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, bw.finish(), Buffer.from([0xff, 0xd9])])
}
