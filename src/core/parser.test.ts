import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseThumbsDb, NotCfbError } from './parser.ts'
import { buildThumbsDb, buildEhThumbsDb, buildGuidDb, buildVistaDb, buildIrfanThumbsDb, buildIrfanNestedThumbsDb } from './fixture.ts'
import { dibToBmp } from './image.ts'

test('parses all thumbnails from a synthetic Thumbs.db', () => {
  const r = parseThumbsDb(buildThumbsDb())
  assert.strictEqual(r.count, 3)
  assert.strictEqual(r.failed, 0)
  assert.strictEqual(r.catalogCount, 3)
})

test('maps reversed stream names back to catalog index', () => {
  const r = parseThumbsDb(buildThumbsDb())
  const e = r.entries.find((x) => x.index === 12)
  assert.ok(e, 'entry with index 12 present')
  assert.strictEqual(e.name, 'DSC012.JPG')
})

test('recovers UTF-16 (non-ASCII) filenames', () => {
  const r = parseThumbsDb(buildThumbsDb())
  const names = r.entries.map((e) => e.name)
  assert.ok(names.includes('фото.jpg'))
})

test('strips MS thumbstream header and yields a JPEG starting at SOI', () => {
  const r = parseThumbsDb(buildThumbsDb())
  for (const e of r.entries) {
    assert.strictEqual(e.payload.kind, 'jpeg')
    if (e.payload.kind === 'jpeg') {
      assert.deepStrictEqual([...e.payload.data.subarray(0, 3)], [0xff, 0xd8, 0xff])
    }
  }
})

test('converts FILETIME to the correct date', () => {
  const r = parseThumbsDb(buildThumbsDb())
  const e = r.entries.find((x) => x.index === 1)
  assert.strictEqual(e.date.toISOString(), '2010-03-09T12:03:40.000Z')
})

test('does not crash on truncated input', () => {
  const full = buildThumbsDb()
  const truncated = full.subarray(0, Math.floor(full.length / 2))
  assert.doesNotThrow(() => {
    try {
      parseThumbsDb(truncated)
    } catch {
      // a thrown parse error is acceptable; a hard crash/segfault is not.
    }
  })
})

test('parses ehthumbs DIB payloads with an 8-byte catalog header', () => {
  const r = parseThumbsDb(buildEhThumbsDb())
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.failed, 0)
  const e = r.entries.find((x) => x.index === 1)
  assert.ok(e)
  assert.strictEqual(e.name, 'DSC00888.JPG') // proves 8-byte header parsed
  assert.strictEqual(e.payload.kind, 'dib')
  assert.strictEqual(e.width, 8)
  assert.strictEqual(e.height, 6)
})

test('decodes 32bpp bottom-up DIB to top-down packed RGB', () => {
  const db = buildThumbsDb([
    { index: 1, name: 'd.bmp', date: new Date('2007-01-01T00:00:00Z'), payload: { kind: 'dib', width: 2, height: 2, channels: 4, bottomUp: true } }
  ])
  const r = parseThumbsDb(db)
  const e = r.entries[0]
  assert.strictEqual(e.payload.kind, 'dib')
  if (e.payload.kind === 'dib') {
    assert.strictEqual(e.payload.pixels.length, 2 * 2 * 3) // alpha dropped, padding removed
    assert.deepStrictEqual([...e.payload.pixels.subarray(0, 3)], [10, 20, 30]) // R,G,B (makeDib default)
  }
})

test('parses Vista size_hash streams with no Catalog (JPEG behind 24-byte prefix)', () => {
  const r = parseThumbsDb(buildVistaDb())
  assert.strictEqual(r.catalogCount, 0)
  assert.strictEqual(r.count, 2)
  const e = r.entries[0]
  assert.strictEqual(e.index, null)
  assert.strictEqual(e.name, null)
  assert.strictEqual(e.label, '31bd239b11dd5a70') // hash after underscore
  assert.strictEqual(e.payload.kind, 'jpeg')
})

test('parses IrfanView ivThumbs.db (filename streams, BMP payloads, no catalog)', () => {
  const r = parseThumbsDb(buildIrfanThumbsDb())
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.failed, 0)
  assert.strictEqual(r.catalogCount, 0)
  const e = r.entries.find((x) => x.streamName === 'IMG_0001.JPG')
  assert.ok(e)
  assert.strictEqual(e.index, null)
  assert.strictEqual(e.name, 'IMG_0001.JPG') // stream name is the real filename
  assert.strictEqual(e.label, 'IMG_0001.JPG')
  assert.strictEqual(e.payload.kind, 'dib') // BMP decoded to packed RGB
  assert.strictEqual(e.width, 8)
  assert.strictEqual(e.height, 6)
  assert.strictEqual(e.date.toISOString(), '2006-07-01T10:00:00.000Z') // FILETIME from prefix
})

test('IrfanView 32bpp top-down BMP decodes to top-down packed RGB', () => {
  const r = parseThumbsDb(buildIrfanThumbsDb())
  const e = r.entries.find((x) => x.streamName === 'фото.JPG') // UTF-16 stream name round-trips
  assert.ok(e)
  assert.strictEqual(e.payload.kind, 'dib')
  if (e.payload.kind === 'dib') {
    assert.strictEqual(e.payload.pixels.length, 8 * 6 * 3) // alpha + row padding dropped
    assert.deepStrictEqual([...e.payload.pixels.subarray(0, 3)], [10, 20, 30]) // R,G,B (makeBmp default)
  }
})

test('parses nested IrfanView (no start sectors) by carving BMP blocks, dropping the spurious lead', () => {
  const r = parseThumbsDb(buildIrfanNestedThumbsDb())
  assert.strictEqual(r.count, 3) // 3 real blocks; the overlapping leading hit is dropped
  assert.strictEqual(r.failed, 0)
  assert.strictEqual(r.recovered, false)
  for (const e of r.entries) assert.strictEqual(e.payload.kind, 'dib')
  // counts don't match named storages in this fixture -> positional labels, real per-block dates
  assert.strictEqual(r.entries[0].name, null)
  assert.strictEqual(r.entries[0].label, '#1')
  assert.strictEqual(r.entries[0].width, 8)
  assert.strictEqual(r.entries[0].height, 6)
  assert.strictEqual(r.entries[0].date.toISOString(), '2007-12-27T13:36:14.000Z')
  assert.strictEqual(r.entries[2].date.toISOString(), '2007-12-27T13:36:16.000Z')
})

test('falls back from GUID names to an index label', () => {
  const r = parseThumbsDb(buildGuidDb())
  for (const e of r.entries) {
    assert.strictEqual(e.name, null)
    assert.strictEqual(e.label, `#${e.index}`)
  }
})

test('trims trailing junk after the JPEG EOI', () => {
  const withJunk = buildThumbsDb([
    { index: 1, name: 'a.jpg', date: new Date('2010-01-01T00:00:00Z'), payload: { kind: 'jpeg', trailing: true } }
  ])
  const r = parseThumbsDb(withJunk)
  const e = r.entries[0]
  assert.strictEqual(e.payload.kind, 'jpeg')
  if (e.payload.kind === 'jpeg') {
    const d = e.payload.data
    assert.deepStrictEqual([...d.subarray(d.length - 2)], [0xff, 0xd9]) // ends exactly at EOI
  }
})

test('decodes JPEG dimensions', () => {
  const r = parseThumbsDb(buildThumbsDb())
  const e = r.entries.find((x) => x.index === 1)
  assert.strictEqual(e.width, 1) // TINY_JPEG is 1x1
  assert.strictEqual(e.height, 1)
})

test('counts unroutable payloads as failed without crashing', () => {
  const db = buildThumbsDb([
    { index: 1, name: 'ok.jpg', date: new Date('2010-01-01T00:00:00Z') },
    { index: 2, name: 'bad.jpg', date: new Date('2010-01-02T00:00:00Z'), payload: { kind: 'garbage' } }
  ])
  const r = parseThumbsDb(db)
  assert.strictEqual(r.count, 1)
  assert.strictEqual(r.failed, 1)
})

test('dibToBmp produces a valid 24bpp BMP with BGR byte order', () => {
  const bmp = dibToBmp(1, 1, Buffer.from([10, 20, 30])) // one RGB pixel
  assert.strictEqual(bmp.toString('ascii', 0, 2), 'BM')
  assert.strictEqual(bmp.readUInt16LE(28), 24) // bpp
  assert.strictEqual(bmp.readInt32LE(18), 1) // width
  assert.strictEqual(bmp.readInt32LE(22), 1) // height
  assert.deepStrictEqual([bmp[54], bmp[55], bmp[56]], [30, 20, 10]) // stored B,G,R
})

// Minimal but structurally valid JPEG (SOI+APP0, an SOF0 carrying dims, zero padding, EOI). Padding
// keeps it over the carve size floor; zeros avoid stray FF D9 sequences.
function fakeJpeg(w: number, h: number, pad = 300): Buffer {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01])
  return Buffer.concat([head, sof, Buffer.alloc(pad, 0), Buffer.from([0xff, 0xd9])])
}

test('recovers raw JPEGs from a damaged / non-CFB container (carve fallback)', () => {
  const buf = Buffer.concat([Buffer.alloc(32, 0x55), fakeJpeg(4, 3), Buffer.alloc(16, 0xaa), fakeJpeg(8, 6)])
  const r = parseThumbsDb(buf)
  assert.strictEqual(r.recovered, true)
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.entries[0].name, null)
  assert.strictEqual(r.entries[0].label, '#1')
  assert.strictEqual(r.entries[0].width, 4)
  assert.strictEqual(r.entries[0].height, 3)
  assert.strictEqual(r.entries[1].width, 8)
})

test('keeps a truncated (no-EOI) JPEG when recovering', () => {
  const partial = fakeJpeg(5, 5).subarray(0, 280) // chop off the EOI
  const r = parseThumbsDb(partial)
  assert.strictEqual(r.recovered, true)
  assert.strictEqual(r.count, 1)
})

test('healthy file is not flagged as recovered', () => {
  assert.strictEqual(parseThumbsDb(buildThumbsDb()).recovered, false)
})

test('non-CFB input throws a clean NotCfbError, not a cryptic crash', () => {
  const garbage = Buffer.from('this is plainly not a compound file', 'utf8')
  assert.throws(() => parseThumbsDb(garbage), NotCfbError)
})

test('all-zero buffer throws NotCfbError without crashing', () => {
  assert.throws(() => parseThumbsDb(Buffer.alloc(16384, 0)), NotCfbError)
})

test('corrupt internal streams are counted failed, never throw', () => {
  const db = buildThumbsDb([
    { index: 1, name: 'good.jpg', date: new Date('2010-01-01T00:00:00Z') },
    { index: 2, name: 'g1.jpg', date: new Date('2010-01-02T00:00:00Z'), payload: { kind: 'garbage' } },
    { index: 3, name: 'g2.jpg', date: new Date('2010-01-03T00:00:00Z'), payload: { kind: 'garbage' } }
  ])
  let r
  assert.doesNotThrow(() => {
    r = parseThumbsDb(db)
  })
  assert.strictEqual(r.count, 1)
  assert.strictEqual(r.failed, 2)
})

test('UTF-16 filenames round-trip intact (Cyrillic + emoji + spaces)', () => {
  const name = 'Привет 世界 🙂.jpg'
  const db = buildThumbsDb([{ index: 5, name, date: new Date('2010-01-01T00:00:00Z') }])
  const r = parseThumbsDb(db)
  assert.strictEqual(r.entries[0].name, name)
})

// --- Optional: real-sample corpus (skipped when the gitignored folder is absent) ---
const realDir = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'real')
test('real corpus parses without crashing', { skip: !existsSync(realDir) }, () => {
  for (const f of readdirSync(realDir).filter((n) => n.endsWith('.db'))) {
    const buf = readFileSync(join(realDir, f))
    assert.doesNotThrow(() => {
      try {
        const r = parseThumbsDb(buf)
        assert.ok(r.count >= 0 && r.failed >= 0, `${f}: sane counts`)
      } catch (e) {
        // non-CFB edge fixtures (zeros, AppleDouble) throw NotCfbError — caught + surfaced as a friendly error by main.
        assert.ok(e instanceof NotCfbError, `${f}: only NotCfbError expected, got ${e}`)
      }
    }, `${f} crashed`)
  }
})
