import test from 'node:test'
import assert from 'node:assert'
import { fmtSize, fmtDate, fmtDims } from './tableFormat.ts'

test('fmtSize: bytes under 1 KiB, else 1-decimal KB', () => {
  assert.strictEqual(fmtSize(512), '512 B')
  assert.strictEqual(fmtSize(1024), '1.0 KB')
  assert.strictEqual(fmtSize(1536), '1.5 KB')
})

test('fmtDate: ISO -> "YYYY-MM-DD HH:MM:SS" (drop T/Z/ms)', () => {
  assert.strictEqual(fmtDate('2010-07-02T14:03:20.000Z'), '2010-07-02 14:03:20')
})

test('fmtDate: null -> blank (not a dash)', () => {
  assert.strictEqual(fmtDate(null), '')
})

test('fmtDims: both present -> WxH', () => {
  assert.strictEqual(fmtDims(96, 128), '96×128')
})

test('fmtDims: missing/zero -> blank (not a dash)', () => {
  assert.strictEqual(fmtDims(null, null), '')
  assert.strictEqual(fmtDims(96, null), '')
  assert.strictEqual(fmtDims(0, 0), '')
})
