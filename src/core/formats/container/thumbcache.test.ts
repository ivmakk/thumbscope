import test from 'node:test'
import assert from 'node:assert/strict'
import { assertOpenableSize, detectIndex, detectThumbcache, parseThumbcache } from './thumbcache.ts'

test('assertOpenableSize passes a size within the limit', () => {
  assert.doesNotThrow(() => assertOpenableSize(1024, 4096))
})

test('assertOpenableSize throws a clear error past the limit', () => {
  assert.throws(() => assertOpenableSize(4097, 4096), /too large to open/)
})

test('detectIndex recognizes an IMMM index file at either signature offset', () => {
  assert.strictEqual(detectIndex(Buffer.from('IMMM....', 'ascii')), true) // documented layout: sig @0
  assert.strictEqual(detectIndex(Buffer.from('\x0c\x00\x30\x20IMMM', 'ascii')), true) // real Win10/11 idx: sig @4
})

test('detectIndex rejects the image container and other magics', () => {
  assert.strictEqual(detectIndex(Buffer.from('CMMM\x20\x00\x00\x00', 'ascii')), false)
  assert.strictEqual(detectIndex(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), false)
  assert.strictEqual(detectIndex(Buffer.from('SQLite f', 'ascii')), false)
  assert.strictEqual(detectIndex(Buffer.from('IMM', 'ascii')), false) // too short to be sure
})

test('detectIndex and detectThumbcache never both match the same header', () => {
  const idx = Buffer.from('IMMM\x00\x00\x00\x00', 'ascii')
  const cmmm = Buffer.from('CMMM\x14\x00\x00\x00', 'ascii')
  assert.ok(detectIndex(idx) && !detectThumbcache(idx))
  assert.ok(detectThumbcache(cmmm) && !detectIndex(cmmm))
})

// detectThumbcache matches on 4 bytes, so a truncated file can reach parseThumbcache with fewer than the
// 24 header bytes the field reads need - it must return empty, not throw (never crash on truncated input).
test('parseThumbcache returns an empty result (no crash) for a truncated header', () => {
  const buf = Buffer.from('CMMM\x15\x00', 'ascii') // 6 bytes: magic + partial version
  assert.doesNotThrow(() => parseThumbcache(buf))
  const r = parseThumbcache(buf)
  assert.strictEqual(r.count, 0)
  assert.strictEqual(r.format, 'thumbcache-cmmm')
})
