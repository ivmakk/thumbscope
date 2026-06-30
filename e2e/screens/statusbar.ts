import type { Page } from '@playwright/test'

// The footer status line ("<n> thumbs · <f> failed · <k> selected · <fmt>").
export class StatusBarScreen {
  constructor(private page: Page) {}

  async selectedCount(): Promise<number> {
    const text = await this.page.getByText(/\d+ selected/).innerText()
    return Number(/(\d+) selected/.exec(text)![1])
  }

  async totalCount(): Promise<number> {
    const text = await this.page.getByText(/\d+ thumbs/).innerText()
    return Number(/(\d+) thumbs/.exec(text)![1])
  }
}
