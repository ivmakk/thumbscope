import test from 'node:test'
import assert from 'node:assert/strict'
import { needsCheckerboard } from './transparency.ts'

test('needsCheckerboard follows real per-thumb alpha, not the codec tag', () => {
  // A translucent thumb gets the backdrop; an opaque one - even a 32bpp rgba icon - does not.
  assert.strictEqual(needsCheckerboard({ hasAlpha: true }), true)
  assert.strictEqual(needsCheckerboard({ hasAlpha: false }), false)
})
