// Windows/Linux Alt-mnemonic latch, as a pure reducer. Real desktop menubars *latch* keyboard-access
// mode: a clean Alt tap toggles underlines on (and focuses the bar); they persist until Esc / re-tap /
// item-select / focus-loss. Alt+letter opens a menu directly. Alt used as a modifier (Alt+Tab, Alt+F4,
// Ctrl+Alt+x) must never toggle.
//
// No DOM here - the reducer returns the next state plus transient `effects` (focus the bar / restore
// prior focus); MenuBar.tsx runs those side effects. Kept pure so node --test covers the state machine.

export interface AltState {
  mode: boolean // mnemonic mode active (underlines shown, bar focused)
  openMenu: string | null // menu value currently open via the keyboard path
  altDown: boolean // Alt is physically held (pending tap)
  altUsedAsModifier: boolean // a non-Alt key fired while Alt was down -> keyup must not toggle
}

export const initialAltState: AltState = {
  mode: false,
  openMenu: null,
  altDown: false,
  altUsedAsModifier: false
}

export interface AltEffects {
  focusBar: boolean // focus the first trigger now (entered mode via tap)
  restoreFocus: boolean // exiting mode -> restore the element focused before entry
}

const NO_EFFECTS: AltEffects = { focusBar: false, restoreFocus: false }

export type AltEvent =
  | { type: 'keydown'; key: string; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }
  | { type: 'keyup'; key: string }
  | { type: 'blur' } // window/bar lost focus - cancel a pending tap, drop out of mode
  | { type: 'select' } // a menu item was activated
  | { type: 'pointerdown' } // a mouse press anywhere

export interface AltContext {
  accessKeys: Record<string, string> // lowercase access letter -> menu value
  suppressed: boolean // focus in a text field or a modal is open -> ignore keyboard mnemonics
}

export interface AltResult {
  state: AltState
  effects: AltEffects
}

const same = (state: AltState): AltResult => ({ state, effects: NO_EFFECTS })

export function altReduce(state: AltState, ev: AltEvent, ctx: AltContext): AltResult {
  switch (ev.type) {
    case 'keydown': {
      const k = ev.key
      // Arm on a bare Alt press (no other modifier, not suppressed). altUsedAsModifier resets so a
      // fresh press starts a clean tap candidate.
      if (k === 'Alt') {
        if (ctx.suppressed || ev.ctrlKey || ev.shiftKey || ev.metaKey) return same(state)
        return { state: { ...state, altDown: true, altUsedAsModifier: false }, effects: NO_EFFECTS }
      }
      // Any non-Alt key while Alt is held: either Alt+letter (open that menu) or Alt-as-modifier.
      if (state.altDown) {
        const letter = k.toLowerCase()
        if (!ctx.suppressed && !ev.ctrlKey && !ev.metaKey && ctx.accessKeys[letter]) {
          return {
            state: { ...state, altUsedAsModifier: true, mode: true, openMenu: ctx.accessKeys[letter] },
            effects: NO_EFFECTS
          }
        }
        // Alt+Tab / Alt+F4 / any other combo: block the keyup toggle, change nothing else.
        return { state: { ...state, altUsedAsModifier: true }, effects: NO_EFFECTS }
      }
      if (ctx.suppressed || !state.mode) return same(state)
      // In mode, no Alt held: Esc is two-stage, a bare access letter opens its menu.
      if (k === 'Escape') {
        if (state.openMenu !== null) {
          // Stage 1: a menu is open -> close it, stay in mode (Radix returns focus to the trigger).
          return { state: { ...state, openMenu: null }, effects: NO_EFFECTS }
        }
        // Stage 2: nothing open -> exit mode, restore prior focus.
        return { state: initialAltState, effects: { focusBar: false, restoreFocus: true } }
      }
      const letter = k.toLowerCase()
      if (!ev.ctrlKey && !ev.metaKey && ctx.accessKeys[letter]) {
        return { state: { ...state, openMenu: ctx.accessKeys[letter] }, effects: NO_EFFECTS }
      }
      return same(state)
    }

    case 'keyup': {
      if (ev.key !== 'Alt') return same(state)
      const cleared = { ...state, altDown: false, altUsedAsModifier: false }
      // Not a clean tap (blur canceled it, or Alt was a modifier) -> no toggle.
      if (ctx.suppressed || !state.altDown || state.altUsedAsModifier) {
        return { state: cleared, effects: NO_EFFECTS }
      }
      if (state.mode) {
        // Re-tap while on -> exit and restore focus.
        return { state: { ...cleared, mode: false, openMenu: null }, effects: { focusBar: false, restoreFocus: true } }
      }
      // Clean tap while off -> latch on and focus the bar.
      return { state: { ...cleared, mode: true }, effects: { focusBar: true, restoreFocus: false } }
    }

    case 'blur': {
      // Focus left: cancel any pending tap. If we were in mode, drop out - but focus already moved,
      // so do NOT restore (that would yank it back).
      const cleared = { ...state, altDown: false, altUsedAsModifier: false }
      if (state.mode) return { state: { ...cleared, mode: false, openMenu: null }, effects: NO_EFFECTS }
      return { state: cleared, effects: NO_EFFECTS }
    }

    case 'select':
      // Item activated -> exit and restore prior focus.
      return { state: initialAltState, effects: { focusBar: false, restoreFocus: true } }

    case 'pointerdown':
      // A click drops mnemonic mode (underlines off). openMenu is left to the mouse/Radix path; no
      // focus restore (the user is pointing somewhere deliberately).
      if (!state.mode) return same(state)
      return { state: { ...state, mode: false, altDown: false, altUsedAsModifier: false }, effects: NO_EFFECTS }
  }
}
