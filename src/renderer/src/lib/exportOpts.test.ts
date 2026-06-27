import test from 'node:test'
import assert from 'node:assert'
import { buildExportOpts, selectionCount, type ExportState } from './exportOpts.ts'

const base: ExportState = {
  scope: 'all',
  selectedIds: ['a', 'b'],
  orphanIds: ['o1', 'o2', 'o3'],
  totalCount: 10,
  mode: 'original',
  quality: 85,
  includeCsv: false,
  skipExisting: false,
  dest: 'pick'
}

test('selectionCount: per-scope counts', () => {
  assert.strictEqual(selectionCount({ ...base, scope: 'selected' }), 2)
  assert.strictEqual(selectionCount({ ...base, scope: 'orphans' }), 3)
  assert.strictEqual(selectionCount({ ...base, scope: 'all' }), 10)
})

test('buildExportOpts: all -> streamNames null', () => {
  assert.strictEqual(buildExportOpts({ ...base, scope: 'all' }).streamNames, null)
})

test('buildExportOpts: selected -> selectedIds; orphans -> orphanIds', () => {
  assert.deepStrictEqual(buildExportOpts({ ...base, scope: 'selected' }).streamNames, ['a', 'b'])
  assert.deepStrictEqual(buildExportOpts({ ...base, scope: 'orphans' }).streamNames, ['o1', 'o2', 'o3'])
})

test('buildExportOpts: dest source -> toSourceFolder true', () => {
  assert.strictEqual(buildExportOpts({ ...base, dest: 'source' }).toSourceFolder, true)
  assert.strictEqual(buildExportOpts({ ...base, dest: 'pick' }).toSourceFolder, false)
})

test('buildExportOpts: passes mode/quality/csv/skip through', () => {
  const opts = buildExportOpts({
    ...base,
    mode: 'upscale800',
    quality: 70,
    includeCsv: true,
    skipExisting: true
  })
  assert.strictEqual(opts.mode, 'upscale800')
  assert.strictEqual(opts.quality, 70)
  assert.strictEqual(opts.includeCsv, true)
  assert.strictEqual(opts.skipExisting, true)
})
