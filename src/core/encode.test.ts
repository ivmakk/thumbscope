import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { encodeJpeg } from './encode.ts'
import { parseThumbsDb } from './parser.ts'
import { decodeAbbrevRgb } from './formats/codec/abbrevJpeg.ts'
import { buildAbbrevJpegDb, buildHashedPngDb } from './fixture.ts'
import type { Payload } from './types.ts'

const root = join(import.meta.dirname, '..', '..')

// The abbrev-jpeg payload (reconstructed abbrev-jpeg JPEG) the parser produces for index 1 (q = [60,40,150,230]).
function cmykPayload(): { payload: Payload; width: number; height: number } {
  const r = parseThumbsDb(buildAbbrevJpegDb())
  const e = r.entries.find((x) => x.index === 1)
  assert.ok(e && e.payload.kind === 'abbrev-jpeg')
  return { payload: e.payload, width: e.width as number, height: e.height as number }
}

test('encodeJpeg on a abbrev-jpeg payload returns a valid JPEG at original size', async () => {
  const { payload, width, height } = cmykPayload()
  const jpeg = await encodeJpeg(payload, width, height, 'original', 85)
  assert.strictEqual(jpeg[0], 0xff)
  assert.strictEqual(jpeg[1], 0xd8) // SOI
  const meta = await sharp(jpeg).metadata()
  assert.strictEqual(meta.format, 'jpeg')
  assert.strictEqual(meta.width, 16)
  assert.strictEqual(meta.height, 16)
})

test('encodeJpeg on a abbrev-jpeg payload upscales to 800px on the longer side', async () => {
  const { payload, width, height } = cmykPayload()
  const jpeg = await encodeJpeg(payload, width, height, 'upscale800', 85)
  const meta = await sharp(jpeg).metadata()
  assert.strictEqual(meta.format, 'jpeg')
  assert.strictEqual(meta.width, 800)
  assert.strictEqual(meta.height, 800)
})

// The png payload the parser produces for a hashed-png stream (3x2 from the fixture).
function pngPayload(): { payload: Payload; width: number; height: number } {
  const r = parseThumbsDb(buildHashedPngDb())
  const e = r.entries[0]
  assert.ok(e && e.payload.kind === 'png')
  return { payload: e.payload, width: e.width as number, height: e.height as number }
}

test('encodeJpeg on a png payload returns a valid JPEG at original size', async () => {
  const { payload, width, height } = pngPayload()
  const jpeg = await encodeJpeg(payload, width, height, 'original', 85)
  assert.strictEqual(jpeg[0], 0xff)
  assert.strictEqual(jpeg[1], 0xd8) // SOI
  const meta = await sharp(jpeg).metadata()
  assert.strictEqual(meta.format, 'jpeg')
  assert.strictEqual(meta.width, 3)
  assert.strictEqual(meta.height, 2)
})

test('encodeJpeg on a png payload upscales to 800px on the longer side', async () => {
  const { payload, width, height } = pngPayload()
  const jpeg = await encodeJpeg(payload, width, height, 'upscale800', 85)
  const meta = await sharp(jpeg).metadata()
  assert.strictEqual(meta.format, 'jpeg')
  assert.strictEqual(meta.width, 800)
})

// End-to-end against the committed photo sample built by `make-sample-thumbsdb.mjs --png`: it must
// parse as all-png (hashed-png layout, no Catalog) and each thumbnail must re-encode to a valid JPEG.
test('the committed Thumbs-png.db sample parses as png and exports valid JPEGs', async () => {
  const r = parseThumbsDb(readFileSync(join(root, 'sample', 'Thumbs-png.db')))
  assert.ok(r.count >= 1)
  assert.strictEqual(r.failed, 0)
  assert.strictEqual(r.catalogCount, 0)
  assert.strictEqual(r.recovered, false)
  assert.ok(r.entries.every((e) => e.payload.kind === 'png'), 'every entry is a png payload')

  const e = r.entries[0]
  assert.ok(e.width && e.height)
  const jpeg = await encodeJpeg(e.payload, e.width, e.height, 'original', 85)
  const meta = await sharp(jpeg).metadata()
  assert.strictEqual(meta.format, 'jpeg')
  assert.strictEqual(meta.width, e.width)
  assert.strictEqual(meta.height, e.height)
})

// End-to-end against the committed photo sample built by `make-sample-thumbsdb.mjs --winxp`: it must
// parse as all-abbrev-jpeg and each thumbnail must decode back to colors close to its source photo.
test('the committed Thumbs-winxp.db sample parses as abbrev-jpeg and decodes faithfully', async () => {
  const r = parseThumbsDb(readFileSync(join(root, 'sample', 'Thumbs-winxp.db')))
  assert.ok(r.count >= 1)
  assert.strictEqual(r.failed, 0)
  assert.strictEqual(r.recovered, false)
  assert.ok(r.entries.every((e) => e.payload.kind === 'abbrev-jpeg'), 'every entry is a reconstructed abbrev-jpeg payload')

  const e = r.entries[0]
  assert.ok(e.payload.kind === 'abbrev-jpeg' && e.name)
  const dec = decodeAbbrevRgb((e.payload as { data: Buffer }).data)
  assert.strictEqual(dec.width, e.width)
  assert.strictEqual(dec.height, e.height)
  assert.strictEqual(dec.pixels.length, dec.width * dec.height * 3)

  // A real photo is not a flat color — the decoded thumbnail must carry spatial variance.
  let min = 255
  let max = 0
  for (let p = 0; p < dec.pixels.length; p += 3) {
    const lum = dec.pixels[p]
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  assert.ok(max - min > 20, 'decoded photo has tonal range')

  // Mean per channel must track the source image resized to the same box (encode/decode is faithful;
  // only the resize differs slightly). Compare with a generous tolerance.
  const ref = await sharp(join(root, 'sample', 'images', e.name as string))
    .resize(dec.width, dec.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()
  const meanOf = (buf: Buffer, off: number): number => {
    let s = 0
    const n = dec.width * dec.height
    for (let p = 0; p < n; p++) s += buf[p * 3 + off]
    return s / n
  }
  for (let ch = 0; ch < 3; ch++) {
    assert.ok(Math.abs(meanOf(dec.pixels, ch) - meanOf(ref, ch)) < 20, `channel ${ch} mean tracks source`)
  }
})
