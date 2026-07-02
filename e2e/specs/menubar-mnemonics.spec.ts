import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'

// Real Alt-mnemonic latch: needs the actual Electron process + Chromium's keyboard/focus engine, so
// it can't run in happy-dom. Windows/Linux only (macOS uses Ctrl+F2, verified manually - OS-swallow
// risk makes it flaky to automate). The kernel logic itself is covered by altMode.test.ts.
test.skip(process.platform === 'darwin', 'Alt mnemonics are Windows/Linux; mac uses Ctrl+F2 (manual)')
test.use({ sample: 'Thumbs.db' })

const underlines = (page: Page): Promise<string[]> =>
  page.locator('[role="menubar"] u').allTextContents()

test('Alt latch -> underline -> Alt+F open -> first item focused -> two-stage Esc -> focus restored', async ({
  page,
  grid,
}) => {
  await grid.waitForThumbnails()

  // Park focus on a known element so we can assert focus-restore at the end.
  const openBtn = page.getByRole('button', { name: /Open/ }).first()
  await openBtn.focus()

  // Alt tap latches mnemonic mode: underlined access letters appear and persist.
  await page.keyboard.press('Alt')
  await expect.poll(() => underlines(page)).toEqual(['F', 'E', 'V', 'W', 'H'])

  // Alt+F opens File directly and focuses its first item.
  await page.keyboard.down('Alt')
  await page.keyboard.press('KeyF')
  await page.keyboard.up('Alt')
  const openItem = page.getByRole('menuitem', { name: /Open/ })
  await expect(openItem).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Open')

  // Stage-1 Esc: closes the menu but stays in mode (underlines remain).
  await page.keyboard.press('Escape')
  await expect(openItem).toBeHidden()
  await expect.poll(() => underlines(page)).toEqual(['F', 'E', 'V', 'W', 'H'])

  // Stage-2 Esc: exits mode (underlines gone) and restores focus to the parked element.
  await page.keyboard.press('Escape')
  await expect.poll(() => underlines(page)).toEqual([])
  await expect(openBtn).toBeFocused()
})
