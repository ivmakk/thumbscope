import test from 'node:test'
import assert from 'node:assert/strict'
import { decode } from './decode.ts'
import { parseThumbsDb } from '../../parser.ts'
import type { Payload } from '../../types.ts'
import { buildThumbsDb, buildEhThumbsDb, buildHashedPngDb, buildAbbrevJpegDb } from '../../fixture.ts'

// decode is total over every payload kind, including abbrev-jpeg (which the old sync payloadToImage threw on).
function payloadOf(buf: Buffer, kind: string) {
  const e = parseThumbsDb(buf).entries.find((x) => x.payload.kind === kind)
  assert.ok(e, `no ${kind} entry in fixture`)
  return e.payload
}

test('decode passes a jpeg payload through as image/jpeg', async () => {
  const p = payloadOf(buildThumbsDb(), 'jpeg')
  const img = await decode(p)
  assert.strictEqual(img.mime, 'image/jpeg')
  assert.deepEqual(img.bytes, (p as { data: Buffer }).data)
})

test('decode passes a png payload through as image/png', async () => {
  const p = payloadOf(buildHashedPngDb(), 'png')
  const img = await decode(p)
  assert.strictEqual(img.mime, 'image/png')
  assert.deepEqual(img.bytes, (p as { data: Buffer }).data)
})

test('decode wraps a dib payload as a BMP', async () => {
  const p = payloadOf(buildEhThumbsDb(), 'dib')
  const img = await decode(p)
  assert.strictEqual(img.mime, 'image/bmp')
  assert.strictEqual(img.bytes.toString('ascii', 0, 2), 'BM')
})

test('decode renders an rgba payload to a PNG (no throw)', async () => {
  const p: Payload = { kind: 'rgba', width: 2, height: 1, pixels: Buffer.from([10, 20, 30, 255, 0, 0, 0, 0]) }
  const img = await decode(p)
  assert.strictEqual(img.mime, 'image/png')
  assert.deepEqual(img.bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'))
})

test('decode renders an abbrev-jpeg payload to a PNG (no throw)', async () => {
  const p = payloadOf(buildAbbrevJpegDb(), 'abbrev-jpeg')
  const img = await decode(p)
  assert.strictEqual(img.mime, 'image/png')
  // PNG signature
  assert.deepEqual(img.bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'))
})
