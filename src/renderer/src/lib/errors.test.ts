import test from 'node:test'
import assert from 'node:assert'
import { friendlyError } from './errors.ts'

test('friendlyError: folder text -> no-db-in-folder message', () => {
  assert.strictEqual(
    friendlyError('No Thumbs.db found in folder X'),
    'No Thumbs.db or ehthumbs.db found in that folder.'
  )
})

test('friendlyError: read/open failure -> could-not-open message', () => {
  assert.strictEqual(friendlyError('Could not read file: EBUSY'), "Couldn't open that file.")
  assert.strictEqual(friendlyError('could not open the thing'), "Couldn't open that file.")
})

test('friendlyError: anything else -> unsupported fallback', () => {
  assert.strictEqual(
    friendlyError('NotCfbError: bad magic'),
    'Unsupported file - not a recognized thumbnail database.'
  )
})

test('friendlyError: thumbcache index -> surfaces the no-images message (not the generic fallback)', () => {
  assert.strictEqual(
    friendlyError('This is a thumbcache index (thumbcache_idx.db) - it holds no thumbnails, only a lookup table. Open a sibling thumbcache_*.db (e.g. thumbcache_256.db) instead.'),
    'Thumbnail index file - no images inside. Open a sibling thumbcache_*.db (e.g. thumbcache_256.db).'
  )
})

test('friendlyError: raw text naming a SQLite database -> SQLite headline (not the generic fallback)', () => {
  // Rule under test: any raw error mentioning a "SQLite database" maps to the SQLite headline. The exact
  // production string and its round-trip live in photothumb.test.ts (the real UNSUPPORTED_SQLITE_MESSAGE).
  assert.strictEqual(
    friendlyError('some SQLite database that is not a thumbnail cache'),
    'SQLite database - not a thumbnail cache Thumbscope can read.'
  )
})

test('friendlyError: folder match wins over read/open when both present', () => {
  // folder is checked first in the original; lock that ordering
  assert.strictEqual(
    friendlyError('could not read folder'),
    'No Thumbs.db or ehthumbs.db found in that folder.'
  )
})
