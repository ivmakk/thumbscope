import test from 'node:test'
import assert from 'node:assert'
import { gridTemplate, resizeWidth, autoFitWidth, minTemplateWidth, COLUMN_ORDER } from './tableColumns.ts'

test('gridTemplate: defaults -> capped Name flex + trailing 1fr spacer', () => {
  assert.strictEqual(gridTemplate(), '4rem minmax(12rem, 36rem) 6rem 12rem 6rem 1fr')
})

test('gridTemplate: an override replaces that column with a fixed px track', () => {
  assert.strictEqual(gridTemplate({ name: 900 }), '4rem 900px 6rem 12rem 6rem 1fr')
})

test('gridTemplate: multiple overrides substitute independently, others keep defaults', () => {
  assert.strictEqual(gridTemplate({ index: 50, dims: 80 }), '50px minmax(12rem, 36rem) 6rem 12rem 80px 1fr')
})

test('gridTemplate: order matches COLUMN_ORDER then spacer', () => {
  assert.deepStrictEqual(COLUMN_ORDER, ['index', 'name', 'size', 'date', 'dims'])
})

test('resizeWidth: push model adds delta to start', () => {
  assert.strictEqual(resizeWidth(200, 50), 250)
  assert.strictEqual(resizeWidth(200, -30), 170)
})

test('resizeWidth: clamps to the min floor (default ~3rem = 48px)', () => {
  assert.strictEqual(resizeWidth(60, -100), 48)
  assert.strictEqual(resizeWidth(200, -500, 32), 32)
})

test('resizeWidth: rounds to whole px', () => {
  assert.strictEqual(resizeWidth(200.4, 0.2), 201)
})

test('autoFitWidth: content + padding (+ optional extra for the Name orphan dot)', () => {
  assert.strictEqual(autoFitWidth(100, { paddingPx: 16 }), 116)
  assert.strictEqual(autoFitWidth(100, { paddingPx: 16, extraPx: 14 }), 130)
})

test('autoFitWidth: clamps to the absolute backstop, ignoring the soft cap', () => {
  assert.strictEqual(autoFitWidth(5000, { paddingPx: 16 }), 1200)
  assert.strictEqual(autoFitWidth(5000, { paddingPx: 16, backstopPx: 800 }), 800)
})

test('autoFitWidth: rounds content up so text never clips', () => {
  assert.strictEqual(autoFitWidth(100.2, { paddingPx: 16 }), 117)
})

test('minTemplateWidth: default = sum of column mins (40rem @16 = 640)', () => {
  assert.strictEqual(minTemplateWidth(), 640)
})

test('minTemplateWidth: an override replaces that column min', () => {
  assert.strictEqual(minTemplateWidth({ name: 900 }), 640 - 192 + 900)
})
