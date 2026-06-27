import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Smoke: App mounts to its empty state with the mocked IPC surface (no file open). Proves the mount
// effects (theme sync + shell-open/export-progress listeners) don't throw against makeApiMock, and
// the open prompt + button render.
test('mounts to the empty state with an Open button', () => {
  render(<App />)

  expect(screen.getByText(/Open or drop a/i)).toBeInTheDocument()
  // The empty-state CTA (there are two "Open…" buttons - header + drop zone); assert at least one.
  expect(screen.getAllByRole('button', { name: /Open/ }).length).toBeGreaterThan(0)
})
