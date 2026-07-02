import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseThumbsDb, openThumbnailDb, NotCfbError, ThumbcacheIndexError } from './open.ts'
import { parseThumbcache, detectThumbcache, detectIndex } from './container/thumbcache.ts'
import { detectSqlite } from './container/sqlite.ts'
import { registry } from './registry.ts'
import { readCfb } from './internal/cfbToolkit.ts'
import type { CfbCtx } from './types.ts'
import {
  buildThumbsDb,
  buildEhThumbsDb,
  buildGuidDb,
  buildVistaDb,
  buildHashedPngDb,
  buildAbbrevJpegDb,
  buildIrfanThumbsDb,
  buildIrfanNestedThumbsDb,
  buildPartialHashedDb,
  buildPartialCatalogDb,
  buildThumbcacheDb,
  makeBmp,
  makeBmpV5,
  TINY_JPEG,
  TINY_PNG
} from '../fixture.ts'

// Each committed fixture buffer + the container format it should resolve to.
const FIXTURES = [
  { name: 'catalog-jpeg', buf: buildThumbsDb(), format: 'cfb' },
  { name: 'catalog-dib (ehthumbs)', buf: buildEhThumbsDb(), format: 'cfb' },
  { name: 'catalog-jpeg-guid', buf: buildGuidDb(), format: 'cfb' },
  { name: 'hashed-jpeg (vista)', buf: buildVistaDb(), format: 'cfb' },
  { name: 'hashed-png', buf: buildHashedPngDb(), format: 'cfb' },
  { name: 'abbrev-jpeg', buf: buildAbbrevJpegDb(), format: 'cfb' },
  { name: 'irfanview-flat', buf: buildIrfanThumbsDb(), format: 'irfanview-flat' },
  { name: 'irfanview-nested', buf: buildIrfanNestedThumbsDb(), format: 'irfanview-nested' }
]

// Property: positive-exclusive detection - exactly one buffer-tier handler claims each fixture.
for (const f of FIXTURES) {
  test(`exactly one handler detects ${f.name}`, () => {
    const cfb = readCfb(f.buf)
    const ctx: CfbCtx = { path: '', header: f.buf.subarray(0, 16), buffer: f.buf, cfb }
    const matched = registry.filter((h) => h.detect(ctx)).map((h) => h.slug)
    assert.deepEqual(matched.length, 1, `${f.name} claimed by ${matched.join(', ') || 'none'}`)
  })

  test(`parseThumbsDb reports format ${f.format} for ${f.name}`, () => {
    assert.strictEqual(parseThumbsDb(f.buf).format, f.format)
  })
}

// Property: the async/header-tier routers are mutually exclusive - a 16-byte magic is claimed by at most
// one of SQLite / thumbcache-CMMM / IMMM-index, and the OLE2 magic by none of them (it falls to the CFB
// sync core). Guards against a future magic change making two routes fire on the same header.
const HEADER_ROUTES = [
  { name: 'sqlite', header: Buffer.from('SQLite format 3\x00', 'ascii'), detect: detectSqlite },
  { name: 'thumbcache-cmmm', header: Buffer.from('CMMM\x14\x00\x00\x00', 'ascii'), detect: detectThumbcache },
  { name: 'immm-index @0', header: Buffer.from('IMMM\x00\x00\x00\x00', 'ascii'), detect: detectIndex },
  { name: 'immm-index @4', header: Buffer.from('\x0c\x00\x30\x20IMMM\x00\x00\x00\x00', 'ascii'), detect: detectIndex },
  { name: 'ole2 (matched by none)', header: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), detect: null }
]
const HEADER_DETECTORS = [detectSqlite, detectThumbcache, detectIndex]
for (const r of HEADER_ROUTES) {
  test(`header-tier routing is exclusive for ${r.name}`, () => {
    const matches = HEADER_DETECTORS.filter((d) => d(r.header))
    assert.strictEqual(matches.length, r.detect ? 1 : 0)
    if (r.detect) assert.ok(r.detect(r.header), `${r.name} own detector should match`)
  })
}

test('{ format } override forces the chosen handler, skipping detection', () => {
  // A catalog-jpeg buffer (detection would pick cfb) forced to the irfanview handler.
  const r = parseThumbsDb(buildThumbsDb(), { format: 'irfanview' })
  assert.ok(r.format.startsWith('irfanview'), `expected irfanview*, got ${r.format}`)
})

test('{ format } with an unknown slug throws a clear error (no bogus format echo)', () => {
  assert.throws(
    () => parseThumbsDb(buildThumbsDb(), { format: 'no-such-format' }),
    /Unknown --format handler/
  )
})

// Tier-2 is owned by the orchestrator: a non-OLE2 buffer with carveable payloads recovers; one with
// nothing carveable throws NotCfbError.
test('tier-2 carve recovers raw JPEGs from a non-OLE2 buffer', () => {
  const soi = Buffer.from([0xff, 0xd8, 0xff])
  const eoi = Buffer.from([0xff, 0xd9])
  const jpeg = Buffer.concat([soi, Buffer.alloc(300, 0x20), eoi])
  const r = parseThumbsDb(Buffer.concat([Buffer.alloc(16, 0x55), jpeg]))
  assert.strictEqual(r.recovered, true)
  assert.strictEqual(r.format, 'recovered')
  assert.ok(r.count >= 1)
})

test('tier-2: an all-zero buffer throws NotCfbError', () => {
  assert.throws(() => parseThumbsDb(Buffer.alloc(4096, 0)), NotCfbError)
})

// Tier-2 also recovers complete BMP files when no JPEG/PNG survives (an orphaned-payload thumbcache).
test('tier-2 carve recovers raw BMP files as dib payloads', () => {
  const buf = Buffer.concat([Buffer.alloc(16, 0x55), makeBmp(8, 6, { bpp: 24 }), makeBmp(10, 8, { bpp: 24 })])
  const r = parseThumbsDb(buf)
  assert.strictEqual(r.recovered, true)
  assert.strictEqual(r.format, 'recovered')
  assert.strictEqual(r.count, 2)
  assert.ok(r.entries.every((e) => e.payload.kind === 'dib'))
})

// Partial-failure rescue: a catalog-less parse that skips streams (failed>0) yields to the carved set
// when carving recovers strictly more thumbnails - covers damaged containers cfb half-reads.
test('partial-read rescue: catalog-less parse prefers the fuller carved set', () => {
  const r = parseThumbsDb(buildPartialHashedDb())
  assert.strictEqual(r.format, 'recovered')
  assert.strictEqual(r.recovered, true)
  assert.strictEqual(r.count, 2) // carve found both JPEGs; the handler decoded only one
})

// The rescue is gated to catalog-less formats: a named (catalog) file keeps its metadata even with a
// failed entry and a richer carve. Removing the catalogCount guard fails this test.
test('partial-read rescue stays off for catalog formats (metadata preserved)', () => {
  const r = parseThumbsDb(buildPartialCatalogDb())
  assert.strictEqual(r.format, 'cfb')
  assert.strictEqual(r.recovered, false)
  assert.strictEqual(r.count, 1)
  assert.strictEqual(r.entries[0].name, 'GOOD.JPG')
})

// Async/path tier: SQLite is header-routed (not a registry peer); OLE2 goes through the sync core.
test('openThumbnailDb routes a SQLite cache to the sqlite-photothumb format', async () => {
  const path = join(process.cwd(), 'sample', 'photothumb.db')
  if (!existsSync(path)) return // sample optional in some checkouts
  const r = await openThumbnailDb(path)
  assert.strictEqual(r.format, 'sqlite-photothumb')
  assert.ok(r.count > 0)
})

test('openThumbnailDb runs the sync core for an OLE2 Thumbs.db', async () => {
  const path = join(process.cwd(), 'sample', 'Thumbs.db')
  if (!existsSync(path)) return
  const r = await openThumbnailDb(path)
  assert.strictEqual(r.format, 'cfb')
  assert.ok(r.count > 0)
})

// thumbcache-cmmm tracer: the flat CMMM buffer parses to one JPEG-payload entry through the buffer core.
test('parseThumbcache parses a CMMM cache to one jpeg entry', () => {
  const r = parseThumbcache(buildThumbcacheDb())
  assert.strictEqual(r.format, 'thumbcache-cmmm')
  assert.strictEqual(r.count, 1)
  assert.strictEqual(r.entries[0].payload.kind, 'jpeg')
})

// Orphaned-payload thumbcache: only placeholder entries live, but complete BMPs survive in free space
// past firstAvail. The thumbcache branch falls back to carve, same as the CFB zero-entry path.
test('openThumbnailDb carves orphaned BMPs from a placeholder-only CMMM cache', async () => {
  const cmmm = buildThumbcacheDb({ entries: [{ hash: tcHash(1), placeholder: true }] })
  const buf = Buffer.concat([cmmm, makeBmp(8, 6, { bpp: 24 }), makeBmp(10, 8, { bpp: 24 })])
  const dir = mkdtempSync(join(tmpdir(), 'thumbscope-tc-'))
  const path = join(dir, 'thumbcache_256.db')
  try {
    writeFileSync(path, buf)
    const r = await openThumbnailDb(path)
    assert.strictEqual(r.recovered, true)
    assert.strictEqual(r.format, 'recovered')
    assert.strictEqual(r.count, 2)
    assert.ok(r.entries.every((e) => e.payload.kind === 'dib'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The sibling IMMM index (`thumbcache_idx.db`) holds no images - refuse it with a clear error at the
// header tier instead of letting tier-2 carve invent broken entries from stray byte runs in the index.
test('openThumbnailDb refuses an IMMM index file instead of carving junk', async () => {
  // Header signals IMMM; the body carries a stray JPEG SOI run that carve would otherwise mis-recover.
  const idx = Buffer.concat([
    Buffer.from('IMMM', 'ascii'),
    Buffer.alloc(20),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(512),
    Buffer.from([0xff, 0xd9])
  ])
  const dir = mkdtempSync(join(tmpdir(), 'thumbscope-idx-'))
  const path = join(dir, 'thumbcache_idx.db')
  try {
    writeFileSync(path, idx)
    await assert.rejects(openThumbnailDb(path), ThumbcacheIndexError)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ...and the async/header tier routes a CMMM file there by magic (not to the CFB core or SQLite).
test('openThumbnailDb routes a CMMM file to the thumbcache-cmmm format', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'thumbscope-tc-'))
  const path = join(dir, 'thumbcache_1280.db')
  try {
    writeFileSync(path, buildThumbcacheDb())
    const r = await openThumbnailDb(path)
    assert.strictEqual(r.format, 'thumbcache-cmmm')
    assert.strictEqual(r.count, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Distinct 8-byte hash from a small int (16 hex chars).
const tcHash = (n: number): Buffer => Buffer.from(String(n).padStart(16, '0'), 'hex')

test('parseThumbcache lists every data-bearing entry', () => {
  const r = parseThumbcache(buildThumbcacheDb({ entries: [{ hash: tcHash(1) }, { hash: tcHash(2) }, { hash: tcHash(3) }] }))
  assert.strictEqual(r.count, 3)
  assert.strictEqual(r.failed, 0)
})

test('parseThumbcache skips dataSize=0 placeholders (not listed, not failed)', () => {
  const r = parseThumbcache(
    buildThumbcacheDb({ entries: [{ hash: tcHash(1) }, { hash: tcHash(2), placeholder: true }, { hash: tcHash(3) }] })
  )
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.failed, 0)
})

test('parseThumbcache parses the v21 header layout (firstEntry@12 / firstAvail@16)', () => {
  const r = parseThumbcache(buildThumbcacheDb({ version: 21, entries: [{ hash: tcHash(1) }, { hash: tcHash(2) }] }))
  assert.strictEqual(r.count, 2)
})

// Vista (v20) entries have an extra 8-byte Extension field after the hash, shifting the size fields and
// the fixed header (56 B, not 48). A v20 fixture with real payloads must decode - regression guard for
// the real-sample bug where v20 caches parsed to zero thumbnails.
test('parseThumbcache parses v20 (Vista) entries with the Extension-shifted layout', () => {
  const r = parseThumbcache(buildThumbcacheDb({ version: 20, entries: [{ hash: tcHash(1) }, { hash: tcHash(2), data: TINY_PNG }] }))
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.failed, 0)
  assert.deepEqual(
    r.entries.map((e) => e.payload.kind),
    ['jpeg', 'png']
  )
})

test('thumbcache entry: label = lowercase hex hash, name/index/date null, streamName deduped on collision', () => {
  const dup = tcHash(7)
  const r = parseThumbcache(buildThumbcacheDb({ entries: [{ hash: dup }, { hash: dup }] }))
  assert.strictEqual(r.count, 2)
  const [a, b] = r.entries
  assert.strictEqual(a.label, dup.toString('hex'))
  assert.strictEqual(b.label, dup.toString('hex'))
  assert.notStrictEqual(a.streamName, b.streamName)
  assert.strictEqual(a.name, null)
  assert.strictEqual(a.index, null)
  assert.strictEqual(a.date, null)
})

test('parseThumbcache skips a corrupt-signature entry and keeps walking (failed++, no throw)', () => {
  const r = parseThumbcache(
    buildThumbcacheDb({ entries: [{ hash: tcHash(1) }, { hash: tcHash(2), corruptSig: true }, { hash: tcHash(3) }] })
  )
  assert.strictEqual(r.count, 2)
  assert.strictEqual(r.failed, 1)
})

test('thumbcache payload is located via idStrSize, not a fixed offset (varied id length)', () => {
  const r = parseThumbcache(buildThumbcacheDb({ entries: [{ hash: tcHash(1), idStr: 'a'.repeat(40) }] }))
  assert.strictEqual(r.count, 1)
  assert.strictEqual(r.entries[0].payload.kind, 'jpeg')
})

const solidBgra = (n: number): [number, number, number, number][] => Array.from({ length: n }, () => [0, 0, 0, 255])

test('thumbcache routes payloads by magic (jpeg / png / bmp -> rgba)', () => {
  const r = parseThumbcache(
    buildThumbcacheDb({
      entries: [
        { hash: tcHash(1), data: TINY_JPEG },
        { hash: tcHash(2), data: TINY_PNG },
        { hash: tcHash(3), data: makeBmpV5(2, 2, solidBgra(4)) }
      ]
    })
  )
  assert.strictEqual(r.count, 3)
  assert.deepEqual(
    r.entries.map((e) => e.payload.kind),
    ['jpeg', 'png', 'rgba']
  )
})

test('thumbcache BMP-V5 entry decodes to rgba with correct dimensions', () => {
  const r = parseThumbcache(buildThumbcacheDb({ entries: [{ hash: tcHash(1), data: makeBmpV5(3, 2, solidBgra(6)) }] }))
  assert.strictEqual(r.entries[0].payload.kind, 'rgba')
  assert.strictEqual(r.entries[0].width, 3)
  assert.strictEqual(r.entries[0].height, 2)
})

// Output guard for the committed synthetic CMMM samples (regenerated by scripts/make-sample-thumbsdb.mjs
// --thumbcache / --thumbcache-jpeg). Guards the generated bytes, not TDD-first. Skips if absent.
test('committed thumbcache_96.db sample parses to 8 rgba (BMP-V5) entries', async () => {
  const path = join(process.cwd(), 'sample', 'thumbcache_96.db')
  if (!existsSync(path)) return
  const r = await openThumbnailDb(path)
  assert.strictEqual(r.format, 'thumbcache-cmmm')
  assert.strictEqual(r.count, 8)
  assert.ok(r.entries.every((e) => e.payload.kind === 'rgba'))
})

test('committed thumbcache_1280.db sample parses to 10 jpeg entries', async () => {
  const path = join(process.cwd(), 'sample', 'thumbcache_1280.db')
  if (!existsSync(path)) return
  const r = await openThumbnailDb(path)
  assert.strictEqual(r.format, 'thumbcache-cmmm')
  assert.strictEqual(r.count, 10)
  assert.ok(r.entries.every((e) => e.payload.kind === 'jpeg'))
})
