import type { Locator, Page } from '@playwright/test'

// The right-panel single-image preview (`Preview`). The `<img>` mounts only once a
// decoded blob URL exists, so a decode regression renders nothing - assert decoded width.
export class PreviewScreen {
  constructor(private page: Page) {}

  image(): Locator {
    return this.page.getByTestId('preview-image')
  }

  // `get-image` returns null silently on decode failure; `naturalWidth > 0` proves the
  // full path: parse -> sharp decode -> IPC -> blob -> Chromium decode.
  async awaitDecoded(): Promise<void> {
    await this.image().waitFor({ state: 'visible' })
    await this.page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="preview-image"]') as HTMLImageElement | null
      return !!img && img.naturalWidth > 0
    })
  }
}
