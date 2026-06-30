import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'

// Interaction wiring happy-dom can't drive: real pointer/layout/keyboard engine.
// theme toggle, virtualized table selection, sort Select + keyboard menubar.
test.use({ sample: 'Thumbs.db' })

test.describe('theme', () => {
  test('View menu flips the dark class and repaints the canvas', async ({ menubar, page, app }) => {
    const hasDark = (): Promise<boolean> =>
      page.evaluate(() => document.documentElement.classList.contains('dark'))
    const bodyBg = (): Promise<string> =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    // Light: settle the class (setTheme is async) before reading the painted color.
    await menubar.setTheme('light')
    await expect.poll(hasDark).toBe(false)
    const lightBg = await bodyBg()

    // Dark: class flips AND the canvas actually repaints (not just the class).
    await menubar.setTheme('dark')
    await expect.poll(hasDark).toBe(true)
    const darkBg = await bodyBg()
    expect(darkBg).not.toBe(lightBg)

    // System: resolves to the OS preference. Read shouldUseDarkColors only AFTER switching to
    // 'system' - setTheme sets nativeTheme.themeSource, so reading it while still on 'dark' would
    // return the forced value, not the OS resolution.
    await menubar.setTheme('system')
    const expectDark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
    await expect.poll(hasDark).toBe(expectDark)
    expect(await bodyBg()).toBe(expectDark ? darkBg : lightBg)
  })
})

test.describe('table', () => {
  test('virtualized table renders rows and drives single/shift/ctrl selection', async ({
    grid,
    toolbar,
    table,
    statusbar,
  }) => {
    await grid.waitForThumbnails()
    await toolbar.setView('table')
    await table.waitForRows()
    expect(await table.count()).toBeGreaterThan(0)

    // Single: a plain click selects exactly one and sets the anchor.
    await table.clickRow(0)
    expect(await statusbar.selectedCount()).toBe(1)
    expect(await table.isSelected(0)).toBe(true)

    // Shift-range: re-anchor on row 1, extend to row 4 -> rows 1..4, not 0, not 5.
    await table.clickRow(1)
    await table.clickRow(4, { shift: true })
    expect(await statusbar.selectedCount()).toBe(4)
    expect(await table.isSelected(0)).toBe(false)
    expect(await table.isSelected(1)).toBe(true)
    expect(await table.isSelected(4)).toBe(true)
    expect(await table.isSelected(5)).toBe(false)

    // Ctrl-toggle: row 0 is outside the range; one ctrl-click adds it, a second removes it.
    await table.clickRow(0, { ctrl: true })
    expect(await statusbar.selectedCount()).toBe(5)
    expect(await table.isSelected(0)).toBe(true)
    await table.clickRow(0, { ctrl: true })
    expect(await statusbar.selectedCount()).toBe(4)
    expect(await table.isSelected(0)).toBe(false)
  })
})

test.describe('sort + keyboard', () => {
  // Run the order check in-page so it uses Chromium's localeCompare (same collation that
  // sorted the list - avoids Node-vs-Chromium ICU disagreement on café_22 / 하늘_11).
  const monotonic = (page: Page, labels: string[], dir: 'asc' | 'desc'): Promise<boolean> =>
    page.evaluate(
      ({ labels, dir }) =>
        labels.every((l, i) => i === 0 || (dir === 'asc' ? labels[i - 1].localeCompare(l) <= 0 : labels[i - 1].localeCompare(l) >= 0)),
      { labels, dir }
    )

  test('sort Select reorders the grid; keyboard menubar selects all', async ({
    grid,
    toolbar,
    menubar,
    statusbar,
    page,
  }) => {
    await grid.waitForThumbnails()

    await toolbar.setSort('name', 'asc')
    expect(await monotonic(page, await grid.labels(), 'asc')).toBe(true)

    await toolbar.setSort('name', 'desc')
    expect(await monotonic(page, await grid.labels(), 'desc')).toBe(true)

    // Keyboard menubar: Edit > Select All via focus + arrows/enter (no pointer).
    await menubar.selectAllViaKeyboard()
    expect(await statusbar.selectedCount()).toBe(await statusbar.totalCount())
    const sel = await grid.cells().evaluateAll((els) => els.map((e) => e.getAttribute('data-selected')))
    expect(sel.every((v) => v === 'true')).toBe(true)
  })
})
