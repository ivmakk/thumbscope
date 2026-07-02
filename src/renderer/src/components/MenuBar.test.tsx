import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuBar } from './MenuBar'
import type { ThemeChoice } from '../../../preload'

// Render with sensible defaults; override per case. window.api is the auto-installed mock (setup.ts,
// platform: 'win32'), so the Alt-mnemonic path is active and Alt+letter opens a menu (controlled value).
const defaults: React.ComponentProps<typeof MenuBar> = {
  onOpen: vi.fn(),
  onExport: vi.fn(),
  canExport: true,
  onSelectAll: vi.fn(),
  canSelectAll: true,
  filePath: '/x/y.db',
  theme: 'system' as ThemeChoice,
  onThemeChange: vi.fn(),
  appVersion: '1.1.0'
}

function renderBar(over: Partial<React.ComponentProps<typeof MenuBar>> = {}): ReturnType<typeof render> {
  return render(<MenuBar {...defaults} {...over} />)
}

// Tap Alt to latch mnemonic mode (underlines on).
function tapAlt(): void {
  fireEvent.keyDown(window, { key: 'Alt' })
  fireEvent.keyUp(window, { key: 'Alt' })
}

// Alt+<letter> opens the matching menu directly.
function altLetter(letter: string): void {
  fireEvent.keyDown(window, { key: 'Alt' })
  fireEvent.keyDown(window, { key: letter })
  fireEvent.keyUp(window, { key: 'Alt' })
}

test('Alt tap latches mnemonic mode and underlines the access letters', () => {
  const { container } = renderBar()
  expect(container.querySelector('u')).toBeNull() // resting: no underlines
  tapAlt()
  const underlined = [...container.querySelectorAll('u')].map((u) => u.textContent)
  expect(underlined).toEqual(['F', 'E', 'V', 'W', 'H'])
})

test('Alt+letter entry saves prior focus and restores it on exit', () => {
  render(
    <div>
      <button data-testid="ext">x</button>
      <MenuBar {...defaults} />
    </div>
  )
  const ext = screen.getByTestId<HTMLButtonElement>('ext')
  ext.focus()
  altLetter('h') // enter mnemonic mode via Alt+letter (no prior tap -> no focusBar effect)
  tapAlt() // re-tap exits mnemonic mode
  expect(ext).toHaveFocus()
})

test('a mouse press drops mnemonic mode (underlines clear)', () => {
  const { container } = renderBar()
  tapAlt()
  expect(container.querySelectorAll('u')).toHaveLength(5)
  fireEvent.pointerDown(window)
  expect(container.querySelector('u')).toBeNull()
})

test('Alt+H opens Help; items call openExternal with the right URLs', () => {
  renderBar()
  altLetter('h')
  fireEvent.click(screen.getByText('Thumbscope Website'))
  expect(window.api.openExternal).toHaveBeenCalledWith('https://thumbscope.vercel.app')

  altLetter('h')
  fireEvent.click(screen.getByText('Release Notes'))
  expect(window.api.openExternal).toHaveBeenCalledWith('https://github.com/ivmakk/thumbscope/releases')
})

test('Help menu shows the app version from the prop', () => {
  renderBar({ appVersion: '9.9.9' })
  altLetter('h')
  expect(screen.getByText('Thumbscope 9.9.9')).toBeInTheDocument()
})

test('dev items hidden when devTools={false}; zoom items still present', () => {
  renderBar({ devTools: false })
  altLetter('v')
  expect(screen.queryByText('Toggle Developer Tools')).toBeNull()
  expect(screen.queryByText('Reload')).toBeNull()
  expect(screen.getByText('Zoom In')).toBeInTheDocument()
})

test('dev items shown when devTools', () => {
  renderBar({ devTools: true })
  altLetter('v')
  expect(screen.getByText('Toggle Developer Tools')).toBeInTheDocument()
})
