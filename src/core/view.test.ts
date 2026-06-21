import test from 'node:test'
import assert from 'node:assert'
import {
  filterEntries,
  sortEntries,
  updateSelection,
  selectAll,
  clearSelection,
  type ViewEntry,
  type SelectionState
} from './view.ts'

const E = (over: Partial<ViewEntry> & { streamName: string }): ViewEntry => ({
  label: over.streamName,
  name: null,
  size: 0,
  date: null,
  index: null,
  ...over
})

const items: ViewEntry[] = [
  E({ streamName: '1', label: 'beach.jpg', name: 'beach.jpg', size: 300, date: '2011-05-01T00:00:00Z', index: 1 }),
  E({ streamName: '2', label: 'apple.jpg', name: 'apple.jpg', size: 100, date: '2010-01-01T00:00:00Z', index: 2 }),
  E({ streamName: '3', label: 'cat.png', name: 'cat.png', size: 200, date: null, index: 3 })
]

test('filterEntries matches label/name case-insensitively', () => {
  assert.deepStrictEqual(filterEntries(items, 'APP').map((e) => e.streamName), ['2'])
  assert.strictEqual(filterEntries(items, '').length, 3)
  assert.strictEqual(filterEntries(items, 'zzz').length, 0)
})

test('sortEntries by name/size/date with direction', () => {
  assert.deepStrictEqual(sortEntries(items, 'name', 'asc').map((e) => e.label), ['apple.jpg', 'beach.jpg', 'cat.png'])
  assert.deepStrictEqual(sortEntries(items, 'size', 'desc').map((e) => e.size), [300, 200, 100])
  // date asc: null sorts first
  assert.deepStrictEqual(sortEntries(items, 'date', 'asc').map((e) => e.streamName), ['3', '2', '1'])
})

test('sortEntries does not mutate input', () => {
  const before = items.map((e) => e.streamName)
  sortEntries(items, 'size', 'desc')
  assert.deepStrictEqual(items.map((e) => e.streamName), before)
})

const ids = ['1', '2', '3', '4', '5']
const empty: SelectionState = { selected: new Set(), anchor: null }

test('plain click selects a single item and sets anchor', () => {
  const s = updateSelection(empty, ids, '3', { shift: false, ctrl: false })
  assert.deepStrictEqual([...s.selected], ['3'])
  assert.strictEqual(s.anchor, '3')
})

test('ctrl click toggles membership', () => {
  let s = updateSelection(empty, ids, '2', { shift: false, ctrl: true })
  s = updateSelection(s, ids, '4', { shift: false, ctrl: true })
  assert.deepStrictEqual([...s.selected].sort(), ['2', '4'])
  s = updateSelection(s, ids, '2', { shift: false, ctrl: true })
  assert.deepStrictEqual([...s.selected], ['4'])
})

test('shift click selects a contiguous range from the anchor', () => {
  const anchored = updateSelection(empty, ids, '2', { shift: false, ctrl: false })
  const s = updateSelection(anchored, ids, '4', { shift: true, ctrl: false })
  assert.deepStrictEqual([...s.selected].sort(), ['2', '3', '4'])
  assert.strictEqual(s.anchor, '2') // anchor unchanged by shift
})

test('selectAll / clearSelection', () => {
  assert.strictEqual(selectAll(ids).selected.size, 5)
  assert.strictEqual(clearSelection().selected.size, 0)
})
