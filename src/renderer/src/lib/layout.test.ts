import test from 'node:test'
import assert from 'node:assert'
import { previewMinPctFor } from './layout.ts'

test('previewMinPctFor: ~150px floor as a percent of window width', () => {
  // 150 / 1000 = 15%
  assert.strictEqual(previewMinPctFor(1000), 15)
  // 150 / 1280 = 11.7 -> rounds to 12
  assert.strictEqual(previewMinPctFor(1280), 12)
})

test('previewMinPctFor: clamps to 8 on wide windows', () => {
  // 150 / 3000 = 5 -> floored to 8
  assert.strictEqual(previewMinPctFor(3000), 8)
})

test('previewMinPctFor: clamps to 40 on narrow windows', () => {
  // 150 / 300 = 50 -> capped at 40
  assert.strictEqual(previewMinPctFor(300), 40)
})
