import test from 'node:test'
import assert from 'node:assert/strict'
import { needsCheckerboard } from './transparency.ts'

test('needsCheckerboard is true only for the alpha-carrying rgba kind', () => {
  assert.strictEqual(needsCheckerboard('rgba'), true)
  for (const k of ['jpeg', 'png', 'dib', 'abbrev-jpeg'] as const) {
    assert.strictEqual(needsCheckerboard(k), false)
  }
})
