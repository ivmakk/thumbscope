import type { Page } from '@playwright/test'

// The browse-panel header: grid/table view toggle + the grid-only sort `Select`.
export class ToolbarScreen {
  constructor(private page: Page) {}

  async setView(view: 'grid' | 'table'): Promise<void> {
    const name = view === 'grid' ? 'Grid view' : 'Table view'
    await this.page.getByRole('radio', { name }).click()
  }

  // Open the sort Select (grid view only) and pick `<key>:<dir>`. asc/desc share a visible
  // label, so target the per-option testid, not the role+name.
  async setSort(key: string, dir: 'asc' | 'desc'): Promise<void> {
    await this.page.getByRole('combobox', { name: 'Sort by' }).click()
    const item = this.page.getByTestId(`sort-${key}:${dir}`)
    await item.waitFor({ state: 'visible' }) // Radix portals the content
    await item.click()
  }
}
