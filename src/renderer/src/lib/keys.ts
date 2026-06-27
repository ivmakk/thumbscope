// Keyboard-shortcut mapping (the native menu's accelerators are gone with the custom menubar).
// Pure: the App keydown effect computes `typing` from the event target (DOM) and dispatches the
// returned action to the matching handler. Kept here so the mapping is unit-testable without a DOM.

export type KeyAction = 'open' | 'export' | 'select-all' | 'toggle-devtools' | 'toggle-fullscreen'

export interface KeyInput {
  ctrlKey: boolean
  key: string
  typing: boolean // focus is in an INPUT/TEXTAREA/contenteditable - suppress text-stealing shortcuts
}

export function keyToAction(e: KeyInput): { action: KeyAction; preventDefault: boolean } | null {
  const k = e.key.toLowerCase()
  if (e.ctrlKey && k === 'o') return { action: 'open', preventDefault: true }
  if (e.ctrlKey && k === 'e') return { action: 'export', preventDefault: true }
  // else the browser selects the whole UI's DOM text
  if (e.ctrlKey && k === 'a' && !e.typing) return { action: 'select-all', preventDefault: true }
  if (e.key === 'F12') return { action: 'toggle-devtools', preventDefault: false }
  if (e.key === 'F11') return { action: 'toggle-fullscreen', preventDefault: true }
  return null
}
