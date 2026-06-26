import CFB from 'cfb'
import type { CatalogEntry, ParseResult, Payload, ThumbEntry } from './types'

const DIGITS = /^[0-9]+$/
const SIZE_HASH = /^[0-9]+_[0-9a-fA-F]+$/
const GUID = /^\{[0-9a-fA-F-]+\}$/

// FILETIME (100ns since 1601) -> JS Date
function filetimeToDate(lo: number, hi: number): Date | null {
  const ft = hi * 4294967296 + lo // 64-bit, fits in double for realistic dates
  if (!ft) return null
  const ms = ft / 10000 - 11644473600000
  return new Date(ms)
}

// Parse Catalog stream -> Map<index, {name, date}>.
// Header length is read from the stream (8 for ehthumbs, 16 for classic); entry layout is shared.
function parseCatalog(buf: Buffer): Map<number, CatalogEntry> {
  const map = new Map<number, CatalogEntry>()
  if (!buf || buf.length < 8) return map
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let off = dv.getUint16(0, true) // header length
  if (off < 8 || off > buf.length) off = 16
  while (off + 16 <= buf.length) {
    const entryLen = dv.getUint32(off, true)
    if (entryLen < 16 || off + entryLen > buf.length) break
    const index = dv.getUint32(off + 4, true)
    const lo = dv.getUint32(off + 8, true)
    const hi = dv.getUint32(off + 12, true)
    const date = filetimeToDate(lo, hi)
    const nameBytes = buf.subarray(off + 16, off + entryLen)
    const name = Buffer.from(nameBytes).toString('utf16le').replace(/\0+$/g, '').trim()
    map.set(index, { name, date })
    off += entryLen
  }
  return map
}

// stream name digits are stored reversed: "21" -> index 12
function streamNameToIndex(name: string): number | null {
  const m = name.replace(/[^0-9]/g, '')
  if (!m) return null
  return parseInt(m.split('').reverse().join(''), 10)
}

// Catalog "names" are sometimes GUIDs (catalog-jpeg-guid); treat those as no real name.
function realName(name: string | undefined): string | null {
  if (!name || GUID.test(name)) return null
  return name
}

// Find embedded JPEG: scan to first SOI (`FF D8 FF`, handles MS thumbstream prefix),
// trim to the last EOI (`FF D9`) so trailing junk is dropped.
function sliceJpeg(buf: Buffer): Buffer | null {
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

// PNG 8-byte signature immediately followed by the IHDR chunk header (length 0x0000000D + 'IHDR').
// Matching all 16 bytes (not just the 8-byte signature) means a stray PNG signature inside JPEG entropy
// data can't trigger a false PNG route — a real PNG always opens with IHDR.
const PNG_SIG_IHDR = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

// Find an embedded PNG: scan to the signature+IHDR (steps over the MS thumbstream prefix, like
// sliceJpeg skips to the SOI), slice to the buffer end (the PNG fills the stream). Null if absent.
function slicePng(buf: Buffer): Buffer | null {
  const at = buf.indexOf(PNG_SIG_IHDR)
  return at < 0 ? null : buf.subarray(at)
}

// Decode width/height from a PNG's IHDR (width at sig+16, height at sig+20, big-endian). Bounds-checked
// like jpegDimensions/parseDib so a malformed IHDR yields null rather than a bogus dimension.
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const width = dv.getUint32(16, false)
  const height = dv.getUint32(20, false)
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) return null
  return { width, height }
}

// Decode width/height from a JPEG's first SOF marker.
function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
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

// Windows XP "abbrev-jpeg" thumbnail: a JPEG whose tables the OS supplies implicitly, so the stream holds
// only SOI + SOF0 + scan. The frame has four components tagged 'R','G','B','A' (52 47 42 41) but the
// pixels are an out-of-order CMYK separation. Detect by that exact component signature: a 4-component
// SOF whose IDs are R,G,B,A — distinct from real CMYK JPEGs (which tag components 1..4 or C,M,Y,K).
function isAbbrevJpeg(buf: Buffer): boolean {
  let i = 2 // skip SOI
  while (i + 19 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    // A true abbrev-jpeg stream is headerless — the OS supplies tables implicitly. A DQT/DHT before the SOF
    // means this is a full 4-component JPEG carrying its own tables, not a abbrev-jpeg stream: leave it for
    // the plain-jpeg path rather than mis-splicing the standard tables over its real ones.
    if (marker === 0xdb || marker === 0xc4) return false
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (buf[i + 9] !== 4) return false // component count
      // component IDs sit at i+10, +13, +16, +19 (each spec is 3 bytes)
      return buf[i + 10] === 0x52 && buf[i + 13] === 0x47 && buf[i + 16] === 0x42 && buf[i + 19] === 0x41
    }
    const len = (buf[i + 2] << 8) | buf[i + 3]
    if (len < 2) break
    i += 2 + len
  }
  return false
}

// Standard JPEG blocks Windows omits from a abbrev-jpeg stream and the OS supplies implicitly. Splicing
// these around the stream's own SOF + scan yields a decodable JPEG. SOI + APP0(JFIF); the two
// quantization tables (luminance id 0 + chrominance id 1) — table 0 carries the true Windows values,
// referenced by every component, so its contents determine the tone; and the standard Annex-K Huffman
// tables (DC + AC, table 0). The four components are decoded as raw samples and mapped to RGB in
// reversed channel order (R=c2, G=c1, B=c0, no complement; the 4th/K component ignored) by
// decodeAbbrevRgb — no Adobe APP14 is needed. The stored image is
// bottom-up, so the decoder flips vertically. Tables match the reference tool thumbsviewer; the
// standard JPEG (Annex-K) tables are not copyrightable. Confirmed against real XP samples.
const ABBREV_SOI_APP0 = Buffer.from('ffd8ffe000104a46494600010101006000600000', 'hex')
const ABBREV_DQT = Buffer.from(
  'ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232',
  'hex'
)
const ABBREV_HUFFMAN = Buffer.from(
  'ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa',
  'hex'
)

// Reconstruct a decodable JPEG from a abbrev-jpeg stream by splicing the standard tables around its own
// SOF + scan: SOI+APP0 | DQT | SOF | HUFFMAN | scan. Cheap (a few buffer slices, no pixel work) so it
// runs at parse time; decodeAbbrevRgb does the actual decode lazily on display/export. Returns null if
// the stream is malformed.
function reconstructAbbrevJpeg(jpg: Buffer): Buffer | null {
  // Locate the SOF marker by walking the marker chain (the stream is SOI + [maybe segments] + SOF +
  // SOS + entropy). Don't assume the SOF sits immediately after SOI — isAbbrevJpeg walks it the same way.
  let i = 2 // skip SOI (sliceJpeg guarantees the buffer starts FF D8 FF)
  let frameIdx = -1
  while (i + 4 <= jpg.length) {
    if (jpg[i] !== 0xff) {
      i++
      continue
    }
    const marker = jpg[i + 1]
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      frameIdx = i
      break
    }
    const len = (jpg[i + 2] << 8) | jpg[i + 3]
    if (len < 2) return null
    i += 2 + len
  }
  if (frameIdx < 0 || frameIdx + 4 > jpg.length) return null
  const frameSize = (jpg[frameIdx + 2] << 8) | jpg[frameIdx + 3]
  const scanIdx = frameIdx + 2 + frameSize
  if (scanIdx > jpg.length) return null
  return Buffer.concat([
    ABBREV_SOI_APP0,
    ABBREV_DQT,
    jpg.subarray(frameIdx, scanIdx),
    ABBREV_HUFFMAN,
    jpg.subarray(scanIdx)
  ])
}

// ehthumbs DIB. Header: u32 headerSize@0, *signed* i32 stride@8 (sign = row direction, abs = bytes
// per row), u32 width@12, u32 height@16. Pixels are 24bpp BGR or 32bpp BGRA (channels derived from
// stride). Normalizes to tightly-packed top-down RGB so display (BMP) and export (sharp) are uniform.
function parseDib(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
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

// Decode a complete BMP file (`BM` + BITMAPINFOHEADER, 24/32bpp) to tightly-packed top-down RGB —
// the same normalized form parseDib produces. IrfanView stores each thumbnail as a full BMP (unlike
// ehthumbs' raw DIB), so rows are padded to a 4-byte boundary and pixel data starts at the file's
// declared offset. Positive header height = bottom-up (the BMP norm), negative = top-down.
function parseBmp(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
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

// Route a stream's bytes to a payload by signature. DIB first (strict header), then PNG, then JPEG. PNG
// must precede JPEG because a PNG's compressed body can incidentally contain `FF D8 FF`, which sliceJpeg
// would mis-slice. A abbrev-jpeg JPEG (headerless XP CMYK) is reconstructed into a `abbrev-jpeg` payload
// that decodeAbbrevRgb later renders to RGB; on reconstruction failure it falls back to the raw bytes so
// the entry still lists.
function classify(content: Buffer): Payload | null {
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

// Width/height for an entry: from a decoded DIB, a PNG's IHDR, else the JPEG/CMYK payload's SOF marker.
function payloadDimensions(payload: Payload): { width: number | null; height: number | null } {
  if (payload.kind === 'dib') return { width: payload.width, height: payload.height }
  const d = payload.kind === 'png' ? pngDimensions(payload.data) : jpegDimensions(payload.data)
  return { width: d?.width ?? null, height: d?.height ?? null }
}

// Byte length reported as the entry `size`.
function payloadSize(payload: Payload): number {
  return payload.kind === 'dib' ? payload.pixels.length : payload.data.length
}

function isThumbStream(name: string): boolean {
  return DIGITS.test(name) || SIZE_HASH.test(name)
}

// Error thrown when the input is not an OLE2/CFB compound file at all (vs. a parseable but
// corrupt one). Lets the caller show a precise message instead of a cryptic cfb internal error.
export class NotCfbError extends Error {
  constructor() {
    super('Not an OLE2 compound file — Thumbs.db / ehthumbs.db files are compound (OLE2) files.')
    this.name = 'NotCfbError'
  }
}

const CARVE_MIN_BYTES = 256 // ignore tiny SOI..EOI runs (icons/EXIF noise) when recovering

// Scan a whole buffer for JPEG runs (SOI `FF D8 FF` .. EOI `FF D9`), non-overlapping. Used to
// recover thumbnails from a damaged/truncated container the CFB reader can't open. A run with no
// trailing EOI (truncated file) is kept from SOI to end so partial images still render.
function carveJpegs(buf: Buffer): Buffer[] {
  const out: Buffer[] = []
  let i = 0
  while (i + 2 < buf.length) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8 || buf[i + 2] !== 0xff) {
      i++
      continue
    }
    let end = -1
    for (let j = i + 3; j + 1 < buf.length; j++) {
      if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
        end = j + 2
        break
      }
    }
    if (end < 0) {
      if (buf.length - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i))
      break
    }
    if (end - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i, end))
    i = end
  }
  return out
}

// Scan a whole buffer for PNG runs (signature+IHDR .. end of the IEND chunk), non-overlapping. The PNG
// analogue of carveJpegs, used to recover thumbnails from a damaged hashed-png container CFB can't open.
// The end is found by walking the chunk chain (each chunk: u32be length + 4-byte type + data + u32 CRC)
// until the IEND chunk - a plain `indexOf('IEND')` would false-match those 4 bytes inside compressed
// IDAT data and truncate the slice. A run with no IEND (truncated file) is kept from the signature to
// end so partial images still render.
function carvePngs(buf: Buffer): Buffer[] {
  const out: Buffer[] = []
  let i = 0
  while ((i = buf.indexOf(PNG_SIG_IHDR, i)) >= 0) {
    let pos = i + 8 // first chunk (IHDR) starts right after the 8-byte signature
    let end = -1
    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos)
      const type = buf.toString('latin1', pos + 4, pos + 8)
      const next = pos + 12 + len // length(4) + type(4) + data(len) + CRC(4)
      if (type === 'IEND') {
        end = Math.min(next, buf.length)
        break
      }
      if (next > buf.length || next <= pos) break // truncated or malformed chunk
      pos = next
    }
    if (end < 0) {
      if (buf.length - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i)) // no IEND: keep to end
      break
    }
    if (end - i >= CARVE_MIN_BYTES) out.push(buf.subarray(i, end))
    i = end
  }
  return out
}

// Recovery path: build entries from raw-carved payloads. No catalog, so labels are positional only.
// JPEG runs are carved first; if none survive, fall back to carving PNG runs (a damaged hashed-png file).
function carveFallback(fileBuffer: Buffer): ParseResult {
  const jpegs = carveJpegs(fileBuffer)
  const payloads: Payload[] = jpegs.length
    ? jpegs.map((data) => ({ kind: 'jpeg', data }))
    : carvePngs(fileBuffer).map((data) => ({ kind: 'png', data }))
  const entries: ThumbEntry[] = payloads.map((payload, i) => {
    const { width, height } = payloadDimensions(payload)
    return {
      index: i + 1,
      streamName: `carved-${i + 1}`,
      name: null,
      label: `#${i + 1}`,
      date: null,
      width,
      height,
      size: payloadSize(payload),
      payload
    }
  })
  return { count: entries.length, failed: 0, catalogCount: 0, entries, recovered: true }
}

// IrfanView ivThumbs.db: an OLE2 container marked by a `_Thumbs_DB_Ver` stream. Unlike classic
// Thumbs.db it has no Catalog — each stream is named with the original filename directly, and the
// payload is a 16-byte prefix (8-byte FILETIME + two u32 flags) followed by a complete BMP file.
const IRFAN_VER_STREAM = '_Thumbs_DB_Ver'
const IRFAN_PREFIX = 16 // FILETIME(8) + 2x u32

// Read the FILETIME that prefixes an IrfanView payload.
function irfanDate(content: Buffer): Date | null {
  if (content.length < 8) return null
  const dv = new DataView(content.buffer, content.byteOffset, content.byteLength)
  return filetimeToDate(dv.getUint32(0, true), dv.getUint32(4, true))
}

// IrfanView payload = 16-byte prefix + BMP. Strip the prefix and decode the BMP to a DIB payload
// (reusing the display/export pipeline). Fall back to a generic classify if the body isn't a BMP.
function classifyIrfan(content: Buffer): Payload | null {
  const body = content.length > IRFAN_PREFIX ? content.subarray(IRFAN_PREFIX) : content
  const bmp = parseBmp(body)
  if (bmp) return { kind: 'dib', width: bmp.width, height: bmp.height, pixels: bmp.pixels }
  return classify(content)
}

function parseIrfanView(cfbObj: ReturnType<typeof CFB.read>): ParseResult {
  const entries: ThumbEntry[] = []
  let failed = 0
  for (const e of cfbObj.FileIndex) {
    // Streams only; skip the version marker and any control-prefixed name (OLE metadata streams
    // like \x05SummaryInformation and the SheetJS \x01 watermark our fixture writer injects).
    if (e.type !== 2 || e.name === IRFAN_VER_STREAM || e.name.charCodeAt(0) < 0x20) continue
    const content = Buffer.from(e.content as Uint8Array)
    const payload = classifyIrfan(content)
    if (!payload) {
      failed++
      continue
    }
    const { width, height } = payloadDimensions(payload)
    entries.push({
      index: null,
      streamName: e.name,
      name: e.name, // stream name is the original filename
      label: e.name,
      date: irfanDate(content),
      width,
      height,
      size: payloadSize(payload),
      payload
    })
  }
  entries.sort((a, b) => a.streamName.localeCompare(b.streamName))
  return { count: entries.length, failed, catalogCount: 0, entries, recovered: false }
}

// Nested IrfanView ivThumbs.db: a sub-variant where each filename is a CFB *storage* whose directory
// entry carries the stream size but no start sector (objType 0, start = ENDOFCHAIN) — so the standard
// reader can't reach the bytes (parseIrfanView yields zero). The payloads still sit in the file as a
// regular grid of [16-byte prefix + complete BMP] blocks, so carve them directly. A block is a `BM`
// header with a BITMAPINFOHEADER, preceded by a prefix whose two trailing u32 flags are both 1.
interface IrfanBlock {
  prefixOff: number
  bmpOff: number
  bmpSize: number
  date: Date | null
}

function carveIrfanBlocks(buf: Buffer): IrfanBlock[] {
  if (buf.length < IRFAN_PREFIX + 54) return []
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const cands: IrfanBlock[] = []
  for (let i = IRFAN_PREFIX; i + 54 < buf.length; i++) {
    if (buf[i] !== 0x42 || buf[i + 1] !== 0x4d) continue // 'BM'
    if (dv.getUint32(i + 10, true) !== 54 || dv.getUint32(i + 14, true) !== 40) continue // dataOffset, BIH size
    if (dv.getUint32(i - 8, true) !== 1 || dv.getUint32(i - 4, true) !== 1) continue // prefix flag signature
    const bmpSize = dv.getUint32(i + 2, true)
    if (bmpSize < 54 || i + bmpSize > buf.length) continue
    cands.push({ prefixOff: i - IRFAN_PREFIX, bmpOff: i, bmpSize, date: irfanDate(buf.subarray(i - IRFAN_PREFIX)) })
  }
  // Keep a non-overlapping sequence. A spurious leading hit (a master/preview BMP embedded in the
  // header region) overlaps the first real block, so if the first candidate overlaps the second,
  // start carving from the second instead.
  const pick = (list: IrfanBlock[]): IrfanBlock[] => {
    const out: IrfanBlock[] = []
    let end = -1
    for (const c of list) {
      if (c.prefixOff >= end) {
        out.push(c)
        end = c.bmpOff + c.bmpSize
      }
    }
    return out
  }
  if (cands.length > 1 && cands[0].bmpOff + cands[0].bmpSize > cands[1].prefixOff) return pick(cands.slice(1))
  return pick(cands)
}

function parseIrfanViewNested(fileBuffer: Buffer, cfbObj: ReturnType<typeof CFB.read>): ParseResult {
  const blocks = carveIrfanBlocks(fileBuffer)
  if (blocks.length === 0) return { count: 0, failed: 0, catalogCount: 0, entries: [], recovered: false }
  // Ordered leaf names from the directory (the storages). Pair with carved blocks by position only
  // when the counts match exactly — without start sectors the filename↔block mapping is best-effort.
  const names = cfbObj.FileIndex.filter(
    (e) => e.type !== 5 && e.name !== IRFAN_VER_STREAM && e.name.charCodeAt(0) >= 0x20
  ).map((e) => e.name)
  const paired = names.length === blocks.length

  const entries: ThumbEntry[] = []
  let failed = 0
  blocks.forEach((blk, i) => {
    const bmp = parseBmp(fileBuffer.subarray(blk.bmpOff, blk.bmpOff + blk.bmpSize))
    if (!bmp) {
      failed++
      return
    }
    const name = paired ? names[i] : null
    entries.push({
      index: null,
      streamName: `ivnested-${i + 1}`,
      name,
      label: name ?? `#${i + 1}`,
      date: blk.date,
      width: bmp.width,
      height: bmp.height,
      size: bmp.pixels.length,
      payload: { kind: 'dib', width: bmp.width, height: bmp.height, pixels: bmp.pixels }
    })
  })
  return { count: entries.length, failed, catalogCount: 0, entries, recovered: false }
}

// Parse a Thumbs.db / ehthumbs.db / ivThumbs.db file buffer.
export function parseThumbsDb(fileBuffer: Buffer): ParseResult {
  let cfbObj: ReturnType<typeof CFB.read>
  try {
    cfbObj = CFB.read(fileBuffer, { type: 'buffer' })
  } catch {
    // Container unreadable (truncated / partly corrupt) — try to recover raw JPEGs before giving up.
    const carved = carveFallback(fileBuffer)
    if (carved.count > 0) return carved
    throw new NotCfbError()
  }
  // IrfanView ivThumbs.db: detected by the version-marker stream. Flat variant first (filename
  // streams); if that yields nothing, the nested-storage variant (carve BMP blocks from the buffer).
  if (cfbObj.FileIndex.some((e) => e.type === 2 && e.name === IRFAN_VER_STREAM)) {
    const flat = parseIrfanView(cfbObj)
    if (flat.count > 0) return flat
    const nested = parseIrfanViewNested(fileBuffer, cfbObj)
    if (nested.count > 0) return nested
  }

  let catalog = new Map<number, CatalogEntry>()
  const streams: { name: string; content: Buffer }[] = []
  for (const e of cfbObj.FileIndex) {
    if (e.type !== 2) continue // stream
    const content = Buffer.from(e.content as Uint8Array)
    if (e.name === 'Catalog') {
      catalog = parseCatalog(content)
    } else if (isThumbStream(e.name)) {
      streams.push({ name: e.name, content })
    }
  }

  const entries: ThumbEntry[] = []
  let failed = 0
  for (const s of streams) {
    const payload = classify(s.content)
    if (!payload) {
      failed++
      continue
    }

    let index: number | null = null
    let name: string | null = null
    let date: Date | null = null
    let label: string

    if (SIZE_HASH.test(s.name)) {
      // Vista: no catalog; label is the hash after the underscore.
      label = s.name.slice(s.name.indexOf('_') + 1)
    } else {
      index = streamNameToIndex(s.name)
      const meta = (index != null && catalog.get(index)) || undefined
      name = realName(meta?.name)
      date = meta?.date ?? null
      label = name ?? (index != null ? `#${index}` : s.name)
    }

    const { width, height } = payloadDimensions(payload)

    entries.push({
      index,
      streamName: s.name,
      name,
      label,
      date,
      width,
      height,
      size: payloadSize(payload),
      payload
    })
  }

  // Container parsed but yielded no usable thumbnails — fall back to raw carving (e.g. directory
  // intact but stream chains corrupt). Only used when the normal path found nothing.
  if (entries.length === 0) {
    const carved = carveFallback(fileBuffer)
    if (carved.count > 0) return carved
  }

  entries.sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.streamName.localeCompare(b.streamName))
  return { count: entries.length, failed, catalogCount: catalog.size, entries, recovered: false }
}
