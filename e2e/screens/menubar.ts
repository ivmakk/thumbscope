import type { Page } from '@playwright/test'
import type { ThemeChoice } from '../../src/preload'

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

  // Open the View menu (pointer) and pick a theme radio item. Same portal-wait as openExport.
  async setTheme(choice: ThemeChoice): Promise<void> {
    await this.page.getByRole('menuitem', { name: 'View', exact: true }).click()
    const name = { system: 'System', light: 'Light', dark: 'Dark' }[choice]
    const item = this.page.getByRole('menuitemradio', { name })
    await item.waitFor({ state: 'visible' })
    await item.click()
  }

  // Keyboard-only path: focus the Edit trigger, open + activate Select All via arrows/enter
  // (no pointer). Proves Radix Menubar keyboard nav, not just click. Edit holds one item.
  async selectAllViaKeyboard(): Promise<void> {
    const edit = this.page.getByRole('menuitem', { name: 'Edit', exact: true })
    await edit.focus()
    await this.page.keyboard.press('Enter') // open (focuses first item)
    const item = this.page.getByRole('menuitem', { name: /Select All/ })
    await item.waitFor({ state: 'visible' })
    await this.page.keyboard.press('ArrowDown')
    await this.page.keyboard.press('Enter') // activate
  }
}
