import test from 'node:test'
import assert from 'node:assert/strict'
import { MENUS, ACCESS_KEYS } from './menus.ts'

test('access keys are unique across menus', () => {
  const keys = MENUS.map((m) => m.accessKey)
  assert.equal(new Set(keys).size, keys.length, 'duplicate accessKey - pick a different letter')
})

test('each access key is a lowercase letter present in its own label', () => {
  for (const m of MENUS) {
    assert.equal(m.accessKey, m.accessKey.toLowerCase(), `${m.label}: accessKey must be lowercase`)
    assert.ok(
      m.label.toLowerCase().includes(m.accessKey),
      `${m.label}: accessKey '${m.accessKey}' not found in label`
    )
  }
})

test('ACCESS_KEYS maps each access letter to its menu value', () => {
  for (const m of MENUS) assert.equal(ACCESS_KEYS[m.accessKey], m.value)
  assert.equal(Object.keys(ACCESS_KEYS).length, MENUS.length)
})
