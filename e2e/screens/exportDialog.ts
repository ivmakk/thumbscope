import type { Locator, Page } from '@playwright/test'

// The export dialog (`ExportDialog`). Reachable surfaces stay on accessible roles; only
// the smoke path is modelled (Destination = source folder -> confirm -> read summary).
export class ExportDialogScreen {
  constructor(private page: Page) {}

  // The Destination `Select` is the combobox inside the label that reads "Destination".
  async setDestSource(): Promise<void> {
    await this.page.locator('label', { hasText: 'Destination' }).getByRole('combobox').click()
    await this.page.getByRole('option', { name: 'Same folder as the .db file' }).click()
  }

  // Footer confirm button is labelled `Export <count>` until busy/done.
  confirmButton(): Locator {
    return this.page.getByRole('button', { name: /^Export \d+$/ })
  }

  async confirm(): Promise<void> {
    await this.confirmButton().click()
  }

  // The `Exported N file(s)[, ...]` summary line shown after a successful export.
  // Also matches the failure line (`⚠ <error>`) so a failed export surfaces its message
  // instead of blocking until timeout on the success-only pattern.
  async summaryText(): Promise<string> {
    const line = this.page.getByText(/Exported \d+ file|⚠ /)
    await line.waitFor({ state: 'visible' })
    const text = (await line.innerText()).trim()
    if (text.startsWith('⚠')) throw new Error(`Export failed: ${text}`)
    return text
  }
}
