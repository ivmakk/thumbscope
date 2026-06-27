import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeAbbrevRgb } from './formats/codec/abbrevJpeg.ts'
import { parseThumbsDb } from './parser.ts'
import { buildAbbrevJpegDb } from './fixture.ts'

// Pull the reconstructed (SOI+APP0 | DQT | SOF | DHT | scan) bytes the parser produces for a abbrev-jpeg
// stream — that is the only input decodeAbbrevRgb is ever given.
function recon(index: number): Buffer {
  const r = parseThumbsDb(buildAbbrevJpegDb())
  const e = r.entries.find((x) => x.index === index)
  assert.ok(e && e.payload.kind === 'abbrev-jpeg')
  return (e.payload as { data: Buffer }).data
}

test('decodes a solid abbrev-jpeg stream to upright RGB with R=c2, G=c1, B=c0', () => {
  // buildAbbrevJpegDb index 1 stores components q = [c0, c1, c2, c3] = [60, 40, 150, 230]; the 4th is ignored.
  const { width, height, pixels } = decodeAbbrevRgb(recon(1))
  assert.strictEqual(width, 16)
  assert.strictEqual(height, 16)
  assert.strictEqual(pixels.length, 16 * 16 * 3)
  for (let p = 0; p < width * height; p++) {
    assert.ok(Math.abs(pixels[p * 3] - 150) <= 1, 'R = c2')
    assert.ok(Math.abs(pixels[p * 3 + 1] - 40) <= 1, 'G = c1')
    assert.ok(Math.abs(pixels[p * 3 + 2] - 60) <= 1, 'B = c0')
  }
})

test('decodes a second solid abbrev-jpeg stream to its expected color', () => {
  // index 2 stores q = [c0, c1, c2, c3] = [200, 180, 90, 240] -> R=90, G=180, B=200.
  const { pixels } = decodeAbbrevRgb(recon(2))
  assert.ok(Math.abs(pixels[0] - 90) <= 1)
  assert.ok(Math.abs(pixels[1] - 180) <= 1)
  assert.ok(Math.abs(pixels[2] - 200) <= 1)
})

// Locate the SOF0 marker (0xff 0xc0) in a reconstructed buffer.
function findSof(b: Buffer): number {
  for (let i = 2; i + 1 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xc0) return i
  throw new Error('no SOF0')
}

test('throws on a subsampled frame so the caller falls back to listing-only', () => {
  const b = Buffer.from(recon(1))
  const sof = findSof(b)
  // From the 0xff marker: first component sampling byte is at +11 (id@+10). Set it to 2x2.
  b[sof + 11] = 0x22
  assert.throws(() => decodeAbbrevRgb(b), /subsampling/)
})

test('throws on a non-baseline (progressive) frame', () => {
  const b = Buffer.from(recon(1))
  const sof = findSof(b)
  b[sof + 1] = 0xc2 // SOF0 -> SOF2 (progressive); decoder never records a frame
  assert.throws(() => decodeAbbrevRgb(b), /missing frame/)
})
