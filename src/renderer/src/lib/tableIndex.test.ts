import test from 'node:test'
import assert from 'node:assert'
import { resolveDisplayIndex } from './tableIndex.ts'
import { sortEntries, type ViewEntry } from '../../../core/view.ts'

// Minimal ViewEntry with a resolvable index. `date` unused here.
function ve(streamName: string, label: string, index: number | null): ViewEntry {
  return { streamName, label, name: label, size: 0, date: null, index }
}

test('resolveDisplayIndex: index-less entries get 1-based file-order stamps', () => {
  const out = resolveDisplayIndex([ve('z', 'z', null), ve('a', 'a', null), ve('m', 'm', null)])
  assert.deepStrictEqual(out.map((e) => e.index), [1, 2, 3])
  assert.deepStrictEqual(out.map((e) => e.streamName), ['z', 'a', 'm']) // input order untouched
})

test('resolveDisplayIndex: real item-IDs pass through unchanged', () => {
  const out = resolveDisplayIndex([ve('a', 'a', 5), ve('b', 'b', 2), ve('c', 'c', 9)])
  assert.deepStrictEqual(out.map((e) => e.index), [5, 2, 9])
})

test('resolveDisplayIndex: mixed uses absolute input position for the null ones', () => {
  const out = resolveDisplayIndex([ve('a', 'a', 10), ve('b', 'b', null), ve('c', 'c', null)])
  assert.deepStrictEqual(out.map((e) => e.index), [10, 2, 3]) // position, not "nth null"
})

test('default index-asc sort over resolved (all null) reads file order, not stream-name order', () => {
  const resolved = resolveDisplayIndex([ve('z', 'z', null), ve('a', 'a', null), ve('m', 'm', null)])
  const sorted = sortEntries(resolved, 'index', 'asc')
  assert.deepStrictEqual(sorted.map((e) => e.streamName), ['z', 'a', 'm']) // 1,2,3 == input order
})

test('the stamp travels with the row under a Name sort (stable identity, not a row counter)', () => {
  const resolved = resolveDisplayIndex([ve('z', 'zebra', null), ve('a', 'apple', null), ve('m', 'mango', null)])
  const byName = sortEntries(resolved, 'name', 'asc')
  assert.deepStrictEqual(byName.map((e) => e.label), ['apple', 'mango', 'zebra'])
  // apple was input-position 2, mango 3, zebra 1 -> stamps stay attached
  assert.deepStrictEqual(byName.map((e) => e.index), [2, 3, 1])
})
