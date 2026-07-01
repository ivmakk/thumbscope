import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBmpRgba } from './bmp.ts'
import { makeBmpV5 } from '../../fixture.ts'

// stored = premultiplied BGRA, top-down. Alpha 51 = 255/5, so straight = premultiplied * 5 exactly.
test('parseBmpRgba un-premultiplies 32bpp BGRA to straight RGBA (exact)', () => {
  const bmp = parseBmpRgba(
    makeBmpV5(2, 2, [
      [30, 20, 10, 255], // opaque: straight == stored -> R10 G20 B30
      [30, 20, 10, 51], // a=51: straight = stored*5 -> R50 G100 B150
      [0, 0, 0, 0], // fully transparent -> zeroed
      [0, 0, 255, 255] // opaque red
    ])
  )
  assert.ok(bmp)
  assert.strictEqual(bmp.width, 2)
  assert.strictEqual(bmp.height, 2)
  assert.deepEqual(Array.from(bmp.pixels), [10, 20, 30, 255, 50, 100, 150, 51, 0, 0, 0, 0, 255, 0, 0, 255])
})

// A uniformly-zero alpha channel is unused padding, not a fully-transparent image: force opaque.
test('parseBmpRgba treats a uniformly-zero alpha channel as opaque', () => {
  const bmp = parseBmpRgba(makeBmpV5(1, 1, [[10, 20, 30, 0]]))
  assert.ok(bmp)
  assert.deepEqual(Array.from(bmp.pixels), [30, 20, 10, 255])
})

// hasAlpha drives the per-thumb transparency backdrop: true only when a pixel is genuinely translucent
// (a < 255). A 32bpp image whose alpha is uniformly 255 is opaque and must not report alpha.
test('parseBmpRgba reports hasAlpha=false for a fully-opaque 32bpp image', () => {
  const bmp = parseBmpRgba(makeBmpV5(2, 1, [[10, 20, 30, 255], [40, 50, 60, 255]]))
  assert.ok(bmp)
  assert.strictEqual(bmp.hasAlpha, false)
})

test('parseBmpRgba reports hasAlpha=true when any pixel is translucent', () => {
  const bmp = parseBmpRgba(makeBmpV5(2, 1, [[10, 20, 30, 255], [40, 50, 60, 51]]))
  assert.ok(bmp)
  assert.strictEqual(bmp.hasAlpha, true)
})

// The uniform-0 path is forced opaque (alpha rewritten to 255), so it must also report no alpha.
test('parseBmpRgba reports hasAlpha=false for the uniformly-zero (opaque-forced) case', () => {
  const bmp = parseBmpRgba(makeBmpV5(1, 1, [[10, 20, 30, 0]]))
  assert.ok(bmp)
  assert.strictEqual(bmp.hasAlpha, false)
})

// Non-standard BITFIELDS masks (channels reordered) are rejected rather than mis-decoded.
test('parseBmpRgba rejects non-standard channel masks', () => {
  const bmp = parseBmpRgba(makeBmpV5(1, 1, [[0, 0, 0, 255]], { masks: [0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000] }))
  assert.strictEqual(bmp, null)
})

// A 32bpp BI_BITFIELDS header whose buffer ends before the 16 mask bytes (file offset 54..69) must not
// crash: the mask reads would run past the DataView. Reachable on corrupt/carved input.
test('parseBmpRgba returns null (no crash) for a truncated BITFIELDS header', () => {
  const buf = Buffer.alloc(60) // >=54 passes the base guard, but < 70 needed for the masks
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54, 10) // dataOffset
  buf.writeUInt32LE(40, 14) // dibSize
  buf.writeInt32LE(1, 18) // width
  buf.writeInt32LE(1, 22) // height
  buf.writeUInt16LE(32, 28) // bpp
  buf.writeUInt32LE(3, 30) // compression = BI_BITFIELDS
  assert.doesNotThrow(() => parseBmpRgba(buf))
  assert.strictEqual(parseBmpRgba(buf), null)
})

// 24bpp stays on parseBmp (opaque RGB); this alpha path only handles 32bpp.
test('parseBmpRgba returns null for 24bpp input', () => {
  // A minimal 24bpp BM header (BITMAPINFOHEADER) - parseBmpRgba should decline it.
  const buf = Buffer.alloc(54 + 4)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(1, 18)
  buf.writeInt32LE(1, 22)
  buf.writeUInt16LE(24, 28)
  assert.strictEqual(parseBmpRgba(buf), null)
})
