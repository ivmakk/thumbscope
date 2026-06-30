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
