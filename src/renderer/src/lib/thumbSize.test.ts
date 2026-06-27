import test from 'node:test'
import assert from 'node:assert'
import { parseThumbSize, DEFAULT_THUMB } from './thumbSize.ts'

test('parseThumbSize: valid in-range value passes through', () => {
  assert.strictEqual(parseThumbSize('120'), 120)
  assert.strictEqual(parseThumbSize('90'), 90)
  assert.strictEqual(parseThumbSize('300'), 300)
})

test('parseThumbSize: out-of-range falls back to default', () => {
  assert.strictEqual(parseThumbSize('89'), DEFAULT_THUMB)
  assert.strictEqual(parseThumbSize('301'), DEFAULT_THUMB)
})

test('parseThumbSize: null / non-numeric falls back to default', () => {
  assert.strictEqual(parseThumbSize(null), DEFAULT_THUMB)
  assert.strictEqual(parseThumbSize('abc'), DEFAULT_THUMB)
  assert.strictEqual(parseThumbSize(''), DEFAULT_THUMB) // Number('') is 0 -> out of range
})
