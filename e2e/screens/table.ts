import type { Locator, Page } from '@playwright/test'

// The left-panel virtualized table (`BrowseTable`). Rows carry `data-testid="table-row"`
// and `data-selected`; only top-run rows are in the DOM, so `.nth(i)` maps to entry i
// while scrolled to top.
export class TableScreen {
  constructor(private page: Page) {}

  rows(): Locator {
    return this.page.getByTestId('table-row')
  }


  row(i: number): Locator {
    return this.rows().nth(i)
  }

  async waitForRows(): Promise<void> {
    await this.row(0).waitFor({ state: 'visible' })
  }

  count(): Promise<number> {
    return this.rows().count()
  }

  // Click a row with optional modifiers. ControlOrMeta matches the app's `ctrlKey || metaKey`.
  async clickRow(i: number, mods?: { shift?: boolean; ctrl?: boolean }): Promise<void> {
    const modifiers: ('Shift' | 'ControlOrMeta')[] = []
    if (mods?.shift) modifiers.push('Shift')
    if (mods?.ctrl) modifiers.push('ControlOrMeta')
    await this.row(i).click({ modifiers })
  }

  async isSelected(i: number): Promise<boolean> {
    return (await this.row(i).getAttribute('data-selected')) === 'true'
  }

  // A body cell for column `k` (index/name/size/date/dims) in row `i`.
  rowCell(i: number, k: string): Locator {
    return this.row(i).locator(`[data-col="${k}"]`)
  }

  // The header cell for column `k` (scoped to the sticky header, not a body row).
  headerCell(k: string): Locator {
    return this.page.locator(`.sticky [data-col="${k}"]`)
  }

  handle(k: string): Locator {
    return this.page.getByTestId(`resize-${k}`)
  }

  async colWidth(k: string): Promise<number> {
    const b = await this.headerCell(k).boundingBox()
    return b?.width ?? 0
  }

  // Drag column `k`'s right-edge handle horizontally by `dx` px (push-model resize).
  async dragHandle(k: string, dx: number): Promise<void> {
    const b = await this.handle(k).boundingBox()
    if (!b) throw new Error(`no resize handle for ${k}`)
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x + dx, y, { steps: 5 })
    await this.page.mouse.up()
  }

  // Scroll the table's own scroll container horizontally.
  async scrollX(px: number): Promise<void> {
    await this.row(0).evaluate((el, px) => {
      ;(el.closest('.overflow-auto') as HTMLElement).scrollLeft = px
    }, px)
  }
}
