import type { ThemeChoice } from '../../../preload'

const KEY = 'theme'

// Validate a persisted/raw theme string down to a known choice (default 'system'). Pure.
export function parseThemeChoice(raw: string | null): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

// Resolve a choice to dark/light given the OS preference. Pure - no matchMedia. 'system' defers
// to the passed-in OS flag; explicit choices ignore it.
export function wantsDark(choice: ThemeChoice, systemPrefersDark: boolean): boolean {
  return choice === 'system' ? systemPrefersDark : choice === 'dark'
}

export function getStoredChoice(): ThemeChoice {
  return parseThemeChoice(localStorage.getItem(KEY))
}

export function storeChoice(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice)
}

export function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
}

// Resolve a choice to dark/light without IPC (used at first paint to avoid a flash).
export function resolveDark(choice: ThemeChoice): boolean {
  return wantsDark(choice, window.matchMedia('(prefers-color-scheme: dark)').matches)
}
