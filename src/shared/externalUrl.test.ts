import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedExternalUrl } from './externalUrl.ts'

test('allows http and https', () => {
  assert.equal(isAllowedExternalUrl('https://thumbscope.vercel.app'), true)
  assert.equal(isAllowedExternalUrl('http://example.com/x'), true)
})

test('rejects non-http(s) schemes', () => {
  assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false)
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false)
  assert.equal(isAllowedExternalUrl('mailto:a@b.c'), false)
})

test('rejects malformed URLs', () => {
  assert.equal(isAllowedExternalUrl('not a url'), false)
  assert.equal(isAllowedExternalUrl(''), false)
})
