import CFB from 'cfb'

// 1x1 baseline JPEG, valid + decodable, used as thumbnail payload in fixtures.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64'
)

type PayloadSpec =
  | { kind: 'jpeg'; prefix?: boolean; trailing?: boolean }
  | { kind: 'dib'; width: number; height: number; channels?: 3 | 4; bottomUp?: boolean }
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

// Variant B: catalog "names" are GUIDs, not filenames.
export function buildGuidDb(): Buffer {
  return buildThumbsDb([
    { index: 1, name: '{A42CD7B6-1111-2222-3333-444455556666}', date: new Date('2015-01-01T00:00:00Z') },
    { index: 2, name: '{A42CD7B6-7777-8888-9999-AAAABBBBCCCC}', date: new Date('2015-01-02T00:00:00Z') }
  ])
}

// Variant C: Vista "modern" — no Catalog, `<size>_<hash>` stream names. Payload here is JPEG behind
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
