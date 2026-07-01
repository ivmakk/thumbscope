import { test, expect } from '../fixtures'

// Column resize / auto-fit / sticky-header alignment need a real pointer + layout engine.

test.describe('resize + auto-fit', () => {
  test.use({ sample: 'Thumbs.db' })

  test('dragging a border widens the column; double-click auto-fits it back to content', async ({ grid, toolbar, table }) => {
    await grid.waitForThumbnails()
    await toolbar.setView('table')
    await table.waitForRows()

    const w0 = await table.colWidth('name')
    await table.dragHandle('name', 160)
    const wDragged = await table.colWidth('name')
    expect(wDragged).toBeGreaterThan(w0 + 100)

    // Auto-fit: from the over-wide drag, double-click shrinks Name to its content width.
    await table.handle('name').dblclick()
    const wFit = await table.colWidth('name')
    expect(wFit).toBeLessThan(wDragged)
  })

  test('header stays column-aligned with rows under horizontal scroll', async ({ grid, toolbar, table }) => {
    await grid.waitForThumbnails()
    await toolbar.setView('table')
    await table.waitForRows()

    await table.dragHandle('name', 600) // force overflow -> horizontal scroll
    await table.scrollX(300)

    const head = await table.headerCell('dims').boundingBox()
    const cell = await table.rowCell(0, 'dims').boundingBox()
    expect(head).not.toBeNull()
    expect(cell).not.toBeNull()
    expect(Math.abs(head!.x - cell!.x)).toBeLessThan(1.5) // same left edge => aligned
  })
})

test.describe('index-less variant', () => {
  test.use({ sample: 'thumbcache_96.db' })

  test('# shows a file-order stamp and empty cells render blank (no dash)', async ({ grid, toolbar, table }) => {
    await grid.waitForThumbnails()
    await toolbar.setView('table')
    await table.waitForRows()

    // Default index-asc over resolved file-order stamps reads 1, 2, ...
    expect((await table.rowCell(0, 'index').textContent())?.trim()).toBe('1')
    expect((await table.rowCell(1, 'index').textContent())?.trim()).toBe('2')

    // thumbcache carries no per-thumb date -> blank cell, not an em-dash.
    expect((await table.rowCell(0, 'date').textContent())?.trim()).toBe('')
  })
})
