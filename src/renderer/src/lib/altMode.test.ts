import test from 'node:test'
import assert from 'node:assert/strict'
import { altReduce, initialAltState, type AltState, type AltEvent, type AltContext } from './altMode.ts'

const ACCESS = { f: 'file', e: 'edit', v: 'view', w: 'window', h: 'help' }
const ctx = (over: Partial<AltContext> = {}): AltContext => ({ accessKeys: ACCESS, suppressed: false, ...over })

const kd = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}): AltEvent => ({
  type: 'keydown',
  key,
  ctrlKey: !!mods.ctrlKey,
  shiftKey: !!mods.shiftKey,
  metaKey: !!mods.metaKey
})
const ku = (key: string): AltEvent => ({ type: 'keyup', key })

// Fold a sequence of events from the initial state.
function run(events: AltEvent[], c: AltContext = ctx()): { state: AltState; effects: ReturnType<typeof altReduce>['effects'] } {
  let state = initialAltState
  let effects = { focusBar: false, restoreFocus: false }
  for (const ev of events) {
    const r = altReduce(state, ev, c)
    state = r.state
    effects = r.effects
  }
  return { state, effects }
}

test('clean Alt tap latches mode on and focuses the bar', () => {
  const { state, effects } = run([kd('Alt'), ku('Alt')])
  assert.equal(state.mode, true)
  assert.equal(state.altDown, false)
  assert.equal(effects.focusBar, true)
})

test('re-tap Alt exits mode and restores focus', () => {
  const { state, effects } = run([kd('Alt'), ku('Alt'), kd('Alt'), ku('Alt')])
  assert.equal(state.mode, false)
  assert.equal(effects.restoreFocus, true)
})

test('Alt+letter opens that menu, mode on, and blocks the keyup toggle', () => {
  const { state } = run([kd('Alt'), kd('f'), ku('Alt')])
  assert.equal(state.mode, true)
  assert.equal(state.openMenu, 'file')
  assert.equal(state.altDown, false)
})

test('Alt used as a modifier (Alt+Tab) does not toggle', () => {
  const { state, effects } = run([kd('Alt'), kd('Tab'), ku('Alt')])
  assert.equal(state.mode, false)
  assert.equal(effects.focusBar, false)
})

test('Ctrl+Alt+x does not arm or toggle', () => {
  // Alt pressed while Ctrl held: never arms.
  const { state } = run([kd('Alt', { ctrlKey: true }), kd('x', { ctrlKey: true }), ku('Alt')])
  assert.equal(state.mode, false)
  assert.equal(state.altDown, false)
})

test('bare access letter while in mode opens the matching menu', () => {
  const { state } = run([kd('Alt'), ku('Alt'), kd('v')])
  assert.equal(state.mode, true)
  assert.equal(state.openMenu, 'view')
})

test('unmapped letter in mode does nothing', () => {
  const { state } = run([kd('Alt'), ku('Alt'), kd('z')])
  assert.equal(state.openMenu, null)
  assert.equal(state.mode, true)
})

test('blur while Alt held cancels the pending tap', () => {
  // Alt down, then window blur, then keyup -> no latch.
  const { state } = run([kd('Alt'), { type: 'blur' }, ku('Alt')])
  assert.equal(state.mode, false)
  assert.equal(state.altDown, false)
})

test('blur while in mode exits without restoring focus', () => {
  const { state, effects } = run([kd('Alt'), ku('Alt'), { type: 'blur' }])
  assert.equal(state.mode, false)
  assert.equal(effects.restoreFocus, false)
})

test('Esc is two-stage: close open menu first, exit on the second', () => {
  // In mode with a menu open: first Esc closes the menu but stays in mode.
  let state = run([kd('Alt'), kd('f'), ku('Alt')]).state
  assert.equal(state.openMenu, 'file')
  let r = altReduce(state, kd('Escape'), ctx())
  assert.equal(r.state.openMenu, null)
  assert.equal(r.state.mode, true)
  assert.equal(r.effects.restoreFocus, false)
  // Second Esc (nothing open) exits and restores focus.
  r = altReduce(r.state, kd('Escape'), ctx())
  assert.equal(r.state.mode, false)
  assert.equal(r.effects.restoreFocus, true)
})

test('selecting an item exits and restores focus', () => {
  let state = run([kd('Alt'), ku('Alt')]).state
  const r = altReduce(state, { type: 'select' }, ctx())
  assert.equal(r.state.mode, false)
  assert.equal(r.effects.restoreFocus, true)
})

test('pointerdown drops mnemonic mode without restoring focus', () => {
  let state = run([kd('Alt'), ku('Alt')]).state
  const r = altReduce(state, { type: 'pointerdown' }, ctx())
  assert.equal(r.state.mode, false)
  assert.equal(r.effects.restoreFocus, false)
})

test('suppressed context ignores Alt entirely (typing / modal open)', () => {
  const { state } = run([kd('Alt'), ku('Alt')], ctx({ suppressed: true }))
  assert.equal(state.mode, false)
  assert.equal(state.altDown, false)
})
