import test from 'node:test'
import assert from 'node:assert'
import { keyToAction } from './keys.ts'

test('keyToAction: Ctrl+O opens (preventDefault)', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: 'o', typing: false }), {
    action: 'open',
    preventDefault: true
  })
  // case-insensitive on the key
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: 'O', typing: false }), {
    action: 'open',
    preventDefault: true
  })
})

test('keyToAction: Ctrl+E exports (preventDefault)', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: 'e', typing: false }), {
    action: 'export',
    preventDefault: true
  })
})

test('keyToAction: Ctrl+A selects all only when not typing', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: 'a', typing: false }), {
    action: 'select-all',
    preventDefault: true
  })
  assert.strictEqual(keyToAction({ ctrlKey: true, key: 'a', typing: true }), null)
})

test('keyToAction: Ctrl+O/E fire even while typing (no typing guard there)', () => {
  assert.strictEqual(keyToAction({ ctrlKey: true, key: 'o', typing: true })?.action, 'open')
  assert.strictEqual(keyToAction({ ctrlKey: true, key: 'e', typing: true })?.action, 'export')
})

test('keyToAction: F12 toggles devtools without preventDefault', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: false, key: 'F12', typing: false }), {
    action: 'toggle-devtools',
    preventDefault: false
  })
})

test('keyToAction: F11 toggles fullscreen with preventDefault', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: false, key: 'F11', typing: false }), {
    action: 'toggle-fullscreen',
    preventDefault: true
  })
})

test('keyToAction: unmapped key -> null', () => {
  assert.strictEqual(keyToAction({ ctrlKey: false, key: 'x', typing: false }), null)
  assert.strictEqual(keyToAction({ ctrlKey: true, key: 's', typing: false }), null)
})
