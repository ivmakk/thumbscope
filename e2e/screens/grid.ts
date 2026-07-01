import type { Locator, Page } from '@playwright/test'

// The left-panel thumbnail grid (`BrowseGrid`). Cells carry `data-testid="thumb-cell"`.
export class GridScreen {
  constructor(private page: Page) {}

  cells(): Locator {
    return this.page.getByTestId('thumb-cell')
  }

  cell(i: number): Locator {
    return this.cells().nth(i)
  }

  // The virtualizer measures a real layout only in a real browser - wait for the first cell.
  async waitForThumbnails(): Promise<void> {
    await this.cell(0).waitFor({ state: 'visible' })
  }

  // Cell presence (waitForThumbnails) only proves the tile mounted - not that its image loaded.
  // `naturalWidth > 0` on cell 0's <img> proves the whole thumb:// path: parse -> decode ->
  // protocol handler -> Chromium decode. A broken handler leaves naturalWidth 0 (false-green guard).
  async awaitFirstImageDecoded(): Promise<void> {
    await this.page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="thumb-cell"] img') as HTMLImageElement | null
      return !!img && img.naturalWidth > 0
    })
  }

  count(): Promise<number> {
    return this.cells().count()
  }

  async select(i: number): Promise<void> {
    await this.cell(i).click()
  }

  // The cell's last span is the `<dims> · <format>` label.
  async payloadKindOf(i: number): Promise<string> {
    const label = await this.cell(i).locator('span').last().innerText()
    return label.split('·').pop()!.trim()
  }

  // The clean entry labels (cell `title` attr = `e.label` exactly), in render order.
  async labels(): Promise<string[]> {
    return (await this.cells().evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))) as string[]
  }
}
