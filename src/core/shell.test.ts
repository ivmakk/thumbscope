import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickDbName, firstPathArg } from './shell.ts'

test('pickDbName: prefers Thumbs.db, case-insensitive, returns real casing', () => {
  assert.equal(pickDbName(['photo.jpg', 'THUMBS.DB', 'ehthumbs.db']), 'THUMBS.DB')
  assert.equal(pickDbName(['ehthumbs.db', 'notes.txt']), 'ehthumbs.db')
  assert.equal(pickDbName(['a.png', 'b.txt']), null)
  assert.equal(pickDbName([]), null)
})

test('pickDbName: priority order Thumbs.db > ehthumbs.db > ehthumbs_vista.db', () => {
  assert.equal(pickDbName(['ehthumbs_vista.db', 'ehthumbs.db', 'Thumbs.db']), 'Thumbs.db')
  assert.equal(pickDbName(['ehthumbs_vista.db', 'ehthumbs.db']), 'ehthumbs.db')
})

test('firstPathArg: returns first real path, skipping flags and dev dot', () => {
  assert.equal(firstPathArg(['C:\\pics\\Thumbs.db']), 'C:\\pics\\Thumbs.db')
  assert.equal(firstPathArg(['--enable-foo', 'C:\\pics']), 'C:\\pics')
  assert.equal(firstPathArg(['.', '--flag']), null)
  assert.equal(firstPathArg(['-psn_0_123', 'D:\\f\\Thumbs.db']), 'D:\\f\\Thumbs.db')
  assert.equal(firstPathArg([]), null)
})
