import CFB from 'cfb'

// 1x1 baseline JPEG, valid + decodable, used as thumbnail payload in fixtures.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64'
)

// 3x2 PNG (solid color), valid + decodable, used as hashed-png thumbnail payload in fixtures.
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPgEpGDIAY4CwANrAFpFLBzTgAAAABJRU5ErkJggg==',
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

// A JPEG run (SOI..EOI) padded past the carver's 256-byte floor, so carving actually keeps it.
const CARVEABLE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300, 0x20), Buffer.from([0xff, 0xd9])])

// Partial-read failure, catalog-less. One hashed thumb stream decodes, a second is unreadable (garbage
// that classify rejects -> failed++), and an extra raw JPEG survives elsewhere in the buffer (the
// non-thumb `Spare` stream stands in for the sectors of a stream cfb returned blank). Carving then finds
// 2 JPEGs while the handler decoded 1 - the condition for the orchestrator's partial-failure rescue.
export function buildPartialHashedDb(): Buffer {
  const cfb = CFB.utils.cfb_new()
  const prefix = Buffer.alloc(24, 0)
  prefix.writeUInt32LE(24, 0)
  CFB.utils.cfb_add(cfb, '/256_a1a1a1a1a1a1a1a1', Buffer.concat([prefix, CARVEABLE_JPEG]))
  CFB.utils.cfb_add(cfb, '/256_b2b2b2b2b2b2b2b2', Buffer.alloc(64, 0x5a))
  CFB.utils.cfb_add(cfb, '/Spare', CARVEABLE_JPEG)
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// Same partial-read shape but catalog-backed (real filenames). The rescue must stay gated off so the
// handler's metadata survives even though carving would find more thumbnails than it decoded.
export function buildPartialCatalogDb(): Buffer {
  const items: FixtureItem[] = [
    { index: 1, name: 'GOOD.JPG', date: new Date('2010-01-01T00:00:00Z') },
    { index: 2, name: 'BROKEN.JPG', date: new Date('2010-01-02T00:00:00Z') }
  ]
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items, 16))
  CFB.utils.cfb_add(cfb, '/1', CARVEABLE_JPEG)
  CFB.utils.cfb_add(cfb, '/2', Buffer.alloc(64, 0x5a))
  CFB.utils.cfb_add(cfb, '/Spare', CARVEABLE_JPEG)
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// hashed-png: same hashed layout as hashed-jpeg (no Catalog, `<size>_<hash>` streams), but the payload
// is a PNG behind the 24-byte MS prefix instead of a JPEG. The PNG-signature scan strips the prefix.
export function buildHashedPngDb(): Buffer {
  const cfb = CFB.utils.cfb_new()
  // 24-byte MS prefix: headerSize=24 but width=0, so DIB routing rejects it (same shape as buildVistaDb).
  const prefix = Buffer.alloc(24, 0)
  prefix.writeUInt32LE(24, 0)
  const items = [
    { name: '256_24ecf3db3592c791', payload: Buffer.concat([prefix, TINY_PNG]) },
    { name: '256_6d37a2e7227263f0', payload: Buffer.concat([prefix, TINY_PNG]) }
  ]
  for (const it of items) CFB.utils.cfb_add(cfb, '/' + it.name, it.payload)
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

// Build a 32bpp `BM`-wrapped BITMAPV5HEADER bitmap (dibSize 124, BI_BITFIELDS) - the small-bucket
// thumbcache payload shape. `stored` is the premultiplied BGRA bytes per pixel in top-down row-major
// order (`[b, g, r, a]`); they're written bottom-up like a real BMP. `masks` overrides the channel
// masks (default standard BGRA) so a test can exercise the non-standard-mask rejection.
export function makeBmpV5(
  width: number,
  height: number,
  stored: [number, number, number, number][],
  opts: { masks?: [number, number, number, number] } = {}
): Buffer {
  const masks = opts.masks ?? [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000]
  const dib = 124
  const dataOffset = 14 + dib
  const stride = width * 4
  const buf = Buffer.alloc(dataOffset + stride * height)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(dataOffset, 10)
  buf.writeUInt32LE(dib, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // positive => bottom-up
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(32, 28)
  buf.writeUInt32LE(3, 30) // BI_BITFIELDS
  buf.writeUInt32LE(stride * height, 34)
  buf.writeUInt32LE(masks[0] >>> 0, 54)
  buf.writeUInt32LE(masks[1] >>> 0, 58)
  buf.writeUInt32LE(masks[2] >>> 0, 62)
  buf.writeUInt32LE(masks[3] >>> 0, 66)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y // bottom-up file rows from top-down source
    let d = dataOffset + y * stride
    for (let x = 0; x < width; x++) {
      const px = stored[srcY * width + x]
      buf[d] = px[0] // B
      buf[d + 1] = px[1] // G
      buf[d + 2] = px[2] // R
      buf[d + 3] = px[3] // A
      d += 4
    }
  }
  return buf
}

export interface ThumbcacheItem {
  hash: Buffer // 8-byte ThumbnailCacheId
  data?: Buffer // payload bytes (default TINY_JPEG); ignored for placeholders
  placeholder?: boolean // dataSize=0 shell-item (Recycle Bin / CLSID) - walkable, no payload
  corruptSig?: boolean // write a bad per-entry signature (valid size) to exercise skip-and-continue
  idStr?: string // override the stored id string (default = hash hex) to vary idStrSize
}

// One thumbcache cache entry. Own `CMMM` sig + size@4, 8-byte hash@8, then the size fields. Their
// offsets shift by version: Vista (v20) inserts an 8-byte `Extension[4]` field after the hash, so the
// fixed header is 56 B and idStrSize/paddingSize/dataSize sit at 24/28/32; Win7 (v21) has no Extension
// (48 B, fields at 16/20/24); Win8+ (v30+) is 56 B with the fields at the Win7 offsets. After the fixed
// header come the UTF-16LE id string, padding, then the payload. Entry size is 8-byte aligned.
function makeThumbcacheEntry(version: number, item: ThumbcacheItem): Buffer {
  const vista = version === 20
  const fixed = vista || version >= 30 ? 56 : 48
  const [idOff, padOff, dataOff] = vista ? [24, 28, 32] : [16, 20, 24]
  const idStr = Buffer.from((item.idStr ?? item.hash.toString('hex')) + '\0', 'utf16le')
  const data = item.placeholder ? Buffer.alloc(0) : item.data ?? TINY_JPEG
  const size = (fixed + idStr.length + data.length + 7) & ~7
  const buf = Buffer.alloc(size)
  buf.write(item.corruptSig ? 'XXXX' : 'CMMM', 0, 'ascii')
  buf.writeUInt32LE(size, 4)
  item.hash.copy(buf, 8)
  if (vista) buf.write('jpg\0', 16, 'utf16le') // Extension[4] wchar (8 B), Vista only
  buf.writeUInt32LE(idStr.length, idOff)
  buf.writeUInt32LE(0, padOff) // paddingSize
  buf.writeUInt32LE(data.length, dataOff)
  idStr.copy(buf, fixed)
  data.copy(buf, fixed + idStr.length)
  return buf
}

// thumbcache-cmmm (Windows Explorer cache): flat, non-OLE2 `CMMM` container. 24-byte file header
// (`CMMM` + version; field order shifts at ver 30 - empty@12, firstEntry@16, firstAvail@20) then a run
// of self-delimiting cache entries up to firstAvail (used size). Defaults to a v32 header + one JPEG
// entry (the detection/routing tracer); pass `version`/`entries` to grow it.
export function buildThumbcacheDb(opts: { version?: number; entries?: ThumbcacheItem[] } = {}): Buffer {
  const version = opts.version ?? 32
  const items = opts.entries ?? [{ hash: Buffer.from('0011223344556677', 'hex') }]
  const body = Buffer.concat(items.map((it) => makeThumbcacheEntry(version, it)))
  const firstEntry = 24
  const firstAvail = firstEntry + body.length
  const header = Buffer.alloc(24)
  header.write('CMMM', 0, 'ascii')
  header.writeUInt32LE(version, 4)
  header.writeUInt32LE(1, 8) // cache type
  if (version >= 30) {
    header.writeUInt32LE(firstEntry, 16) // v30+: empty@12, firstEntry@16, firstAvail@20 (no count)
    header.writeUInt32LE(firstAvail, 20)
  } else {
    header.writeUInt32LE(firstEntry, 12) // v20/21: firstEntry@12, firstAvail@16, count@20
    header.writeUInt32LE(firstAvail, 16)
  }
  return Buffer.concat([header, body])
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
