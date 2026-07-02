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

test('keyToAction: Ctrl+= / Ctrl++ zoom in (preventDefault)', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: '=', typing: false }), {
    action: 'zoom-in',
    preventDefault: true
  })
  assert.strictEqual(keyToAction({ ctrlKey: true, key: '+', typing: false })?.action, 'zoom-in')
})

test('keyToAction: Ctrl+- / Ctrl+_ zoom out (preventDefault)', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: '-', typing: false }), {
    action: 'zoom-out',
    preventDefault: true
  })
  assert.strictEqual(keyToAction({ ctrlKey: true, key: '_', typing: false })?.action, 'zoom-out')
})

test('keyToAction: Ctrl+0 resets zoom (preventDefault)', () => {
  assert.deepStrictEqual(keyToAction({ ctrlKey: true, key: '0', typing: false }), {
    action: 'zoom-reset',
    preventDefault: true
  })
})

test('keyToAction: zoom keys fire even while typing', () => {
  assert.strictEqual(keyToAction({ ctrlKey: true, key: '0', typing: true })?.action, 'zoom-reset')
})

test('keyToAction: zoom keys need Ctrl', () => {
  assert.strictEqual(keyToAction({ ctrlKey: false, key: '0', typing: false }), null)
})

test('keyToAction: unmapped key -> null', () => {
  assert.strictEqual(keyToAction({ ctrlKey: false, key: 'x', typing: false }), null)
  assert.strictEqual(keyToAction({ ctrlKey: true, key: 's', typing: false }), null)
})
