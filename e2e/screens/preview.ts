import type { Locator, Page } from '@playwright/test'

// The right-panel single-image preview (`Preview`). The `<img>` src is a `thumb://` URL; a
// decode failure serves 404 so the image never decodes - assert decoded width.
export class PreviewScreen {
  constructor(private page: Page) {}

  image(): Locator {
    return this.page.getByTestId('preview-image')
  }

  // A `thumb://` decode failure serves 404; `naturalWidth > 0` proves the full path:
  // parse -> decode -> thumb:// handler -> Chromium decode.
  async awaitDecoded(): Promise<void> {
    await this.image().waitFor({ state: 'visible' })
    await this.page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="preview-image"]') as HTMLImageElement | null
      return !!img && img.naturalWidth > 0
    })
  }
}
