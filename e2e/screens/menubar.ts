import type { Page } from '@playwright/test'

// The custom themed menubar (`MenuBar` over Radix `Menubar`). The smoke opens Export
// through the menu (the discoverable user path), not the `Ctrl+E` accelerator.
export class MenuBarScreen {
  constructor(private page: Page) {}

  async openExport(): Promise<void> {
    // exact: open File menu adds "Copy File Path"/"Copy Folder Path" - a substring match would be ambiguous.
    await this.page.getByRole('menuitem', { name: 'File', exact: true }).click()
    const item = this.page.getByRole('menuitem', { name: /Export/ })
    await item.waitFor({ state: 'visible' }) // Radix portals the content - wait before clicking
    await item.click()
  }
}
