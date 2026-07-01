import { test, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowseTable } from './BrowseTable'
import type { ThumbMeta } from '../../../preload'

// happy-dom has no real canvas, so measureText returns 0 and auto-fit (correctly) bails. Stub a
// proportional-ish width so the auto-fit path is exercised headlessly; real measurement is E2E.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (t: string) => ({ width: t.length * 8 })
  } as unknown as CanvasRenderingContext2D)
})

// Row bodies are virtualized (TanStack) and need real layout, which happy-dom lacks - so row
// content (resolved #, blank cells) is covered by the pure kernels (tableIndex/tableFormat tests)
// and by the E2E spec. Here we only assert the header chrome, which renders without layout.

function meta(over: Partial<ThumbMeta> & { streamName: string; index: number }): ThumbMeta {
  return { name: null, label: over.streamName, date: null, format: 'jpeg', width: null, height: null, size: 1024, hasAlpha: false, orphan: false, ...over }
}

const ENTRIES: ThumbMeta[] = [
  meta({ streamName: 'a', index: 1, label: 'alpha.jpg', width: 96, height: 96 }),
  meta({ streamName: 'b', index: 2, label: 'a-much-longer-filename-for-autofit.jpeg' })
]

function renderTable(): void {
  render(
    <BrowseTable
      entries={ENTRIES}
      selected={new Set()}
      previewId={null}
      version={0}
      onClick={vi.fn()}
      sortKey="index"
      sortDir="asc"
      onSort={vi.fn()}
    />
  )
}

test('every column has a resize handle', () => {
  renderTable()
  for (const k of ['index', 'name', 'size', 'date', 'dims']) {
    expect(screen.getByTestId(`resize-${k}`)).toBeInTheDocument()
  }
})

test('double-clicking a border auto-fits: the column moves from the flex default to a fixed px track', () => {
  renderTable()
  const header = screen.getByText('Name').closest('[data-col]')!.parentElement as HTMLElement
  expect(header.style.gridTemplateColumns).toContain('minmax(12rem, 36rem)')
  fireEvent.doubleClick(screen.getByTestId('resize-name'))
  expect(header.style.gridTemplateColumns).not.toContain('minmax(12rem, 36rem)')
  expect(header.style.gridTemplateColumns).toMatch(/\dpx/)
})
