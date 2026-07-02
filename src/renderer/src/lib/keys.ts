// Keyboard-shortcut mapping (the native menu's accelerators are gone with the custom menubar).
// Pure: the App keydown effect computes `typing` from the event target (DOM) and dispatches the
// returned action to the matching handler. Kept here so the mapping is unit-testable without a DOM.

export type KeyAction =
  | 'open'
  | 'export'
  | 'select-all'
  | 'toggle-devtools'
  | 'toggle-fullscreen'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'

export interface KeyInput {
  ctrlKey: boolean
  key: string
  typing: boolean // focus is in an INPUT/TEXTAREA/contenteditable - suppress text-stealing shortcuts
}

// Is focus in a text-entry target? Shared by the App accelerator effect and the menubar mnemonic
// suppression so both agree on "the user is typing".
export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export function keyToAction(e: KeyInput): { action: KeyAction; preventDefault: boolean } | null {
  const k = e.key.toLowerCase()
  if (e.ctrlKey && k === 'o') return { action: 'open', preventDefault: true }
  if (e.ctrlKey && k === 'e') return { action: 'export', preventDefault: true }
  // else the browser selects the whole UI's DOM text
  if (e.ctrlKey && k === 'a' && !e.typing) return { action: 'select-all', preventDefault: true }
  // Zoom: match shifted+unshifted glyphs so it works regardless of layout state. preventDefault
  // stops Chromium's own page-zoom firing on top of our windowAction.
  if (e.ctrlKey && (k === '=' || k === '+')) return { action: 'zoom-in', preventDefault: true }
  if (e.ctrlKey && (k === '-' || k === '_')) return { action: 'zoom-out', preventDefault: true }
  if (e.ctrlKey && k === '0') return { action: 'zoom-reset', preventDefault: true }
  if (e.key === 'F12') return { action: 'toggle-devtools', preventDefault: false }
  if (e.key === 'F11') return { action: 'toggle-fullscreen', preventDefault: true }
  return null
}
