import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseThumbsDb, openThumbnailDb, NotCfbError } from './open.ts'
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
  buildIrfanNestedThumbsDb
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

test('{ format } override forces the chosen handler, skipping detection', () => {
  // A catalog-jpeg buffer (detection would pick cfb) forced to the irfanview handler.
  const r = parseThumbsDb(buildThumbsDb(), { format: 'irfanview' })
  assert.ok(r.format.startsWith('irfanview'), `expected irfanview*, got ${r.format}`)
})

test('{ format } with an unknown slug returns a clean empty result, not a throw', () => {
  const r = parseThumbsDb(buildThumbsDb(), { format: 'no-such-format' })
  assert.strictEqual(r.count, 0)
  assert.strictEqual(r.format, 'no-such-format')
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
