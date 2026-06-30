import type { Locator, Page } from '@playwright/test'

// The left-panel virtualized table (`BrowseTable`). Rows carry `data-testid="table-row"`
// and `aria-selected`; only top-run rows are in the DOM, so `.nth(i)` maps to entry i
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
    return (await this.row(i).getAttribute('aria-selected')) === 'true'
  }
}
