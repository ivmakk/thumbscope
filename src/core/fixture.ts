import CFB from 'cfb'

// 1x1 baseline JPEG, valid + decodable, used as thumbnail payload in fixtures.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64'
)

type PayloadSpec =
  | { kind: 'jpeg'; prefix?: boolean; trailing?: boolean }
  | { kind: 'dib'; width: number; height: number; channels?: 3 | 4; bottomUp?: boolean }
  | { kind: 'abbrev-jpeg'; width: number; height: number; q: [number, number, number, number] }
  | { kind: 'garbage' }

interface FixtureItem {
  index: number
  name: string
  date: Date
  payload?: PayloadSpec
}

// Build a DIB stream matching the real ehthumbs layout: u32 headerSize@0, signed i32 stride@8
// (negative = bottom-up), u32 width@12, height@16, imgSize@20. 24bpp BGR or 32bpp BGRA, solid color.
export function makeDib(
  width: number,
  height: number,
  opts: { channels?: 3 | 4; bottomUp?: boolean; rgb?: [number, number, number] } = {}
): Buffer {
  const { channels = 3, bottomUp = false, rgb = [10, 20, 30] } = opts
  const stride = width * channels
  const buf = Buffer.alloc(24 + stride * height)
  buf.writeUInt32LE(24, 0)
  buf.writeInt32LE(bottomUp ? -stride : stride, 8)
  buf.writeUInt32LE(width, 12)
  buf.writeUInt32LE(height, 16)
  buf.writeUInt32LE(stride * height, 20)
  for (let p = 24; p + channels <= buf.length; p += channels) {
    buf[p] = rgb[2] // B
    buf[p + 1] = rgb[1] // G
    buf[p + 2] = rgb[0] // R
    if (channels === 4) buf[p + 3] = 0xff // A
  }
  return buf
}

function makePayload(spec: PayloadSpec | undefined): Buffer {
  spec = spec ?? { kind: 'jpeg' }
  if (spec.kind === 'dib')
    return makeDib(spec.width, spec.height, { channels: spec.channels, bottomUp: spec.bottomUp })
  if (spec.kind === 'abbrev-jpeg') return makeAbbrevJpeg(spec.width, spec.height, spec.q)
  if (spec.kind === 'garbage') return Buffer.alloc(64, 0x5a)
  let jpeg = spec.prefix ? Buffer.concat([Buffer.alloc(12, 0xab), TINY_JPEG]) : TINY_JPEG
  if (spec.trailing) jpeg = Buffer.concat([jpeg, Buffer.alloc(20, 0xcc)]) // junk after EOI
  return jpeg
}

function dateToFiletime(date: Date): { lo: number; hi: number } {
  const ft = (date.getTime() + 11644473600000) * 10000
  const lo = ft % 4294967296
  const hi = Math.floor(ft / 4294967296)
  return { lo, hi }
}

// Build a Catalog stream. headerLen 16 = classic, 8 = ehthumbs.
function buildCatalog(items: FixtureItem[], headerLen: number): Buffer {
  const header = Buffer.alloc(headerLen)
  header.writeUInt16LE(headerLen, 0)
  header.writeUInt16LE(7, 2)
  header.writeUInt32LE(items.length, 4)
  if (headerLen >= 16) {
    header.writeUInt32LE(96, 8) // width
    header.writeUInt32LE(96, 12) // height
  }

  const parts: Buffer[] = [header]
  for (const it of items) {
    const nameBuf = Buffer.from(it.name + '\0', 'utf16le')
    const entryLen = 16 + nameBuf.length
    const e = Buffer.alloc(16)
    e.writeUInt32LE(entryLen, 0)
    e.writeUInt32LE(it.index, 4)
    const { lo, hi } = dateToFiletime(it.date)
    e.writeUInt32LE(lo, 8)
    e.writeUInt32LE(hi, 12)
    parts.push(Buffer.concat([e, nameBuf]))
  }
  return Buffer.concat(parts)
}

// stream name = index digits reversed (real Thumbs.db quirk)
function indexToStreamName(index: number): string {
  return String(index).split('').reverse().join('')
}

// Build a catalog-backed Thumbs.db / ehthumbs.db buffer.
export function buildThumbsDb(items?: FixtureItem[], headerLen = 16): Buffer {
  items = items || [
    { index: 1, name: 'IMG001.JPG', date: new Date('2010-03-09T12:03:40Z') },
    { index: 2, name: 'фото.jpg', date: new Date('2011-05-01T08:00:00Z') },
    { index: 12, name: 'DSC012.JPG', date: new Date('2012-12-31T23:59:59Z'), payload: { kind: 'jpeg', prefix: true } }
  ]
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items, headerLen))
  for (const it of items) {
    CFB.utils.cfb_add(cfb, '/' + indexToStreamName(it.index), makePayload(it.payload))
  }
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// ehthumbs-style: 8-byte catalog header, DIB payloads.
export function buildEhThumbsDb(): Buffer {
  return buildThumbsDb(
    [
      { index: 1, name: 'DSC00888.JPG', date: new Date('2007-07-01T10:00:00Z'), payload: { kind: 'dib', width: 8, height: 6 } },
      { index: 2, name: 'DSC00889.JPG', date: new Date('2007-07-02T10:00:00Z'), payload: { kind: 'dib', width: 8, height: 6 } }
    ],
    8
  )
}

// Build a complete BMP file (`BM` + BITMAPINFOHEADER, solid color). Positive height = bottom-up
// (BMP norm), negative = top-down. Rows pad to a 4-byte boundary. Matches IrfanView's payload body.
export function makeBmp(
  width: number,
  height: number,
  opts: { bpp?: 24 | 32; bottomUp?: boolean; rgb?: [number, number, number] } = {}
): Buffer {
  const { bpp = 24, bottomUp = true, rgb = [10, 20, 30] } = opts
  const channels = bpp / 8
  const stride = (width * channels + 3) & ~3
  const imgSize = stride * height
  const buf = Buffer.alloc(54 + imgSize)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(54, 10) // pixel data offset
  buf.writeUInt32LE(40, 14) // BITMAPINFOHEADER size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(bottomUp ? height : -height, 22)
  buf.writeUInt16LE(1, 26) // planes
  buf.writeUInt16LE(bpp, 28)
  buf.writeUInt32LE(imgSize, 34)
  for (let y = 0; y < height; y++) {
    let d = 54 + y * stride
    for (let x = 0; x < width; x++) {
      buf[d] = rgb[2] // B
      buf[d + 1] = rgb[1] // G
      buf[d + 2] = rgb[0] // R
      if (channels === 4) buf[d + 3] = 0xff
      d += channels
    }
  }
  return buf
}

// Prefix a BMP with IrfanView's 16-byte header: FILETIME(8) + two u32 flags.
function irfanPayload(date: Date, bmp: Buffer): Buffer {
  const pre = Buffer.alloc(16)
  const { lo, hi } = dateToFiletime(date)
  pre.writeUInt32LE(lo, 0)
  pre.writeUInt32LE(hi, 4)
  pre.writeUInt32LE(1, 8)
  pre.writeUInt32LE(1, 12)
  return Buffer.concat([pre, bmp])
}

// IrfanView ivThumbs.db: `_Thumbs_DB_Ver` marker + filename-named streams of (prefix + BMP).
export function buildIrfanThumbsDb(): Buffer {
  const cfb = CFB.utils.cfb_new()
  const ver = Buffer.alloc(4)
  ver.writeUInt32LE(1, 0)
  CFB.utils.cfb_add(cfb, '_Thumbs_DB_Ver', ver)
  const items = [
    { name: 'IMG_0001.JPG', date: new Date('2006-07-01T10:00:00Z'), bmp: makeBmp(8, 6, { bpp: 24, bottomUp: true }) },
    { name: 'фото.JPG', date: new Date('2006-07-02T10:00:00Z'), bmp: makeBmp(8, 6, { bpp: 32, bottomUp: false }) }
  ]
  for (const it of items) CFB.utils.cfb_add(cfb, '/' + it.name, irfanPayload(it.date, it.bmp))
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// Nested IrfanView sub-variant: a version-marker-only container followed by a grid of raw
// [prefix + BMP] blocks (the real files store these as storages with no start sector, so the data is
// only reachable by carving). Counts won't match named storages here, so the parser labels them
// positionally. A leading half-overlapping block exercises the spurious-first-hit drop.
export function buildIrfanNestedThumbsDb(): Buffer {
  const cfb = CFB.utils.cfb_new()
  const ver = Buffer.alloc(4)
  ver.writeUInt32LE(1, 0)
  CFB.utils.cfb_add(cfb, '_Thumbs_DB_Ver', ver)
  const container = Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)

  const realRegion = Buffer.concat([
    irfanPayload(new Date('2007-12-27T13:36:14Z'), makeBmp(8, 6, { bpp: 24, bottomUp: true })),
    irfanPayload(new Date('2007-12-27T13:36:15Z'), makeBmp(8, 6, { bpp: 32, bottomUp: false })),
    irfanPayload(new Date('2007-12-27T13:36:16Z'), makeBmp(8, 6, { bpp: 24, bottomUp: true }))
  ])
  // Spurious leading block (mirrors the master/preview hit in real files): a valid prefix + BMP
  // header whose declared size runs across the real blocks, so it overlaps the first real one and is
  // dropped by the carver.
  const spurPrefix = Buffer.alloc(16)
  spurPrefix.writeUInt32LE(1, 8)
  spurPrefix.writeUInt32LE(1, 12)
  const spurHeader = Buffer.alloc(54)
  spurHeader.write('BM', 0, 'ascii')
  spurHeader.writeUInt32LE(realRegion.length, 2) // oversized: covers the real blocks
  spurHeader.writeUInt32LE(54, 10)
  spurHeader.writeUInt32LE(40, 14)
  return Buffer.concat([container, spurPrefix, spurHeader, realRegion])
}

// catalog-jpeg-guid: catalog "names" are GUIDs, not filenames.
export function buildGuidDb(): Buffer {
  return buildThumbsDb([
    { index: 1, name: '{A42CD7B6-1111-2222-3333-444455556666}', date: new Date('2015-01-01T00:00:00Z') },
    { index: 2, name: '{A42CD7B6-7777-8888-9999-AAAABBBBCCCC}', date: new Date('2015-01-02T00:00:00Z') }
  ])
}

// hashed-jpeg: Vista "modern" — no Catalog, `<size>_<hash>` stream names. Payload here is JPEG behind
// a 24-byte MS prefix (matches the real sample), which the SOI scan strips.
export function buildVistaDb(): Buffer {
  const cfb = CFB.utils.cfb_new()
  // 24-byte MS prefix: headerSize=24 but width=0 (as in the real sample), so DIB routing rejects it.
  const prefix = Buffer.alloc(24, 0)
  prefix.writeUInt32LE(24, 0)
  const items = [
    { name: '256_31bd239b11dd5a70', payload: Buffer.concat([prefix, TINY_JPEG]) },
    { name: '256_88baea7191a5a539', payload: Buffer.concat([prefix, TINY_JPEG]) }
  ]
  for (const it of items) CFB.utils.cfb_add(cfb, '/' + it.name, it.payload)
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// Standard JPEG luminance DC Huffman codes (Annex K), category -> [code, bit length]. Matches the
// table the parser splices into a abbrev-jpeg stream, so a stream built here decodes there.
const DC_LUM: Record<number, [number, number]> = {
  0: [0b00, 2],
  1: [0b010, 3],
  2: [0b011, 3],
  3: [0b100, 3],
  4: [0b101, 3],
  5: [0b110, 3],
  6: [0b1110, 4],
  7: [0b11110, 5],
  8: [0b111110, 6],
  9: [0b1111110, 7],
  10: [0b11111110, 8],
  11: [0b111111110, 9]
}
const AC_EOB: [number, number] = [0b1010, 4] // end-of-block (run/size 0/0) in the AC luminance table

// MSB-first JPEG bit writer with 0xFF byte stuffing (a literal 0xFF in the entropy stream is followed
// by a 0x00).
class JpegBitWriter {
  private bytes: number[] = []
  private cur = 0
  private nbits = 0
  put(code: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((code >> i) & 1)
      if (++this.nbits === 8) {
        this.bytes.push(this.cur)
        if (this.cur === 0xff) this.bytes.push(0x00)
        this.cur = 0
        this.nbits = 0
      }
    }
  }
  finish(): Buffer {
    if (this.nbits > 0) {
      this.cur = (this.cur << (8 - this.nbits)) | ((1 << (8 - this.nbits)) - 1) // pad with 1s
      this.bytes.push(this.cur)
      if (this.cur === 0xff) this.bytes.push(0x00)
    }
    return Buffer.from(this.bytes)
  }
}

function category(v: number): number {
  let a = Math.abs(v)
  let c = 0
  while (a) {
    c++
    a >>= 1
  }
  return c
}

// Encode a solid-color abbrev-jpeg thumbnail stream: SOI + SOF0 (4 components tagged R,G,B,A) + SOS +
// entropy + EOI, with no quantization/Huffman tables — exactly the abbreviated shape real XP streams
// have. q is the four stored component values; a solid image has zero AC, so each block is just a DC
// term (predicted per component) followed by EOB. q values round-trip through the parser's decode.
export function makeAbbrevJpeg(width: number, height: number, q: [number, number, number, number]): Buffer {
  // DC coefficient for a solid block, matching the parser's Annex-K luminance quant table (DC step 8)
  // and the decoder's idct scaling, so the decoded value equals q[c].
  const dc = q.map((v) => v - 128)
  const mcus = Math.ceil(width / 8) * Math.ceil(height / 8)
  const bw = new JpegBitWriter()
  const prev = [0, 0, 0, 0]
  for (let m = 0; m < mcus; m++) {
    for (let c = 0; c < 4; c++) {
      const diff = dc[c] - prev[c]
      prev[c] = dc[c]
      const cat = category(diff)
      bw.put(DC_LUM[cat][0], DC_LUM[cat][1])
      if (cat > 0) bw.put(diff < 0 ? diff + (1 << cat) - 1 : diff, cat)
      bw.put(AC_EOB[0], AC_EOB[1])
    }
  }
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x14, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x04,
    0x52, 0x11, 0x00, 0x47, 0x11, 0x00, 0x42, 0x11, 0x00, 0x41, 0x11, 0x00
  ])
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0e, 0x04, 0x52, 0x00, 0x47, 0x00, 0x42, 0x00, 0x41, 0x00, 0x00, 0x3f, 0x00])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, bw.finish(), Buffer.from([0xff, 0xd9])])
}

// abbrev-jpeg (Windows XP "headerless" CMYK) thumbnails: classic catalog, abbreviated 4-component JPEGs.
export function buildAbbrevJpegDb(): Buffer {
  return buildThumbsDb([
    { index: 1, name: 'PICT0001.JPG', date: new Date('2005-12-09T20:10:18Z'), payload: { kind: 'abbrev-jpeg', width: 16, height: 16, q: [60, 40, 150, 230] } },
    { index: 2, name: 'PICT0002.JPG', date: new Date('2005-12-09T20:11:00Z'), payload: { kind: 'abbrev-jpeg', width: 16, height: 16, q: [200, 180, 90, 240] } }
  ])
}
