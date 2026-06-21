import type { ThemeChoice } from '../../../preload'

const KEY = 'theme'

export function getStoredChoice(): ThemeChoice {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function storeChoice(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice)
}

export function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
}

// Resolve a choice to dark/light without IPC (used at first paint to avoid a flash).
export function resolveDark(choice: ThemeChoice): boolean {
  if (choice === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches
  return choice === 'dark'
}
