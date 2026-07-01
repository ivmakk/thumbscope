import { test } from 'node:test'
import assert from 'node:assert/strict'
import { thumbUrl, parseThumbUrl } from './thumbUrl.ts'

test('round-trips a stream name', () => {
  assert.equal(parseThumbUrl(thumbUrl('21', 3)), '21')
})

test('round-trips URL-special chars intact', () => {
  assert.equal(parseThumbUrl(thumbUrl('256_a/b?c', 3)), '256_a/b?c')
})

test('malformed / non-thumb URL → null', () => {
  assert.equal(parseThumbUrl('https://example.com/x'), null)
  assert.equal(parseThumbUrl('thumb://img/3'), null)
  assert.equal(parseThumbUrl('garbage'), null)
})

test('malformed percent-escape → null, not a throw', () => {
  assert.equal(parseThumbUrl('thumb://img/1/%'), null)
  assert.equal(parseThumbUrl('thumb://img/1/%zz'), null)
})
