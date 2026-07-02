import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { Api } from '../../preload'

// Radix primitives (Select, Dialog) call a handful of pointer/layout APIs that happy-dom doesn't
// implement. Mount-only tests never exercise the behavior, so no-op stubs are enough to keep them
// from throwing during render.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}

Element.prototype.scrollIntoView ??= function (): void {}
Element.prototype.hasPointerCapture ??= function (): boolean {
  return false
}
Element.prototype.setPointerCapture ??= function (): void {}
Element.prototype.releasePointerCapture ??= function (): void {}

// Typed default fake for the preload IPC surface. Every method is a vi.fn() with a benign default so
// component mount effects (theme sync, shell-open + export-progress listeners) don't throw; tests
// override per-case. Typed as Api so a contract change that drops/renames a method fails typecheck here.
export function makeApiMock(): Api {
  const noopUnsub = (): void => {}
  return {
    openFile: vi.fn().mockResolvedValue(null),
    openPath: vi.fn().mockResolvedValue(null),
    exportThumbs: vi.fn().mockResolvedValue({ ok: 0, failed: 0, skipped: 0, outDir: '' }),
    openFolder: vi.fn().mockResolvedValue(''),
    copyText: vi.fn().mockResolvedValue(undefined),
    onExportProgress: vi.fn().mockReturnValue(noopUnsub),
    onShellOpen: vi.fn().mockReturnValue(noopUnsub),
    windowAction: vi.fn().mockResolvedValue(undefined),
    setTheme: vi.fn().mockResolvedValue(false),
    getTheme: vi.fn().mockResolvedValue(false),
    onThemeUpdated: vi.fn().mockReturnValue(noopUnsub),
    pathForFile: vi.fn().mockReturnValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
    getAppVersion: vi.fn().mockResolvedValue('1.1.0'),
    platform: 'win32'
  }
}

// Install a fresh default before every test; clearMocks resets call history between tests.
beforeEach(() => {
  ;(window as unknown as { api: Api }).api = makeApiMock()
})

afterEach(() => {
  cleanup()
})
