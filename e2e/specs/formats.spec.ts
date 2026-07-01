import { test, expect } from '../fixtures'

// Breadth: each committed sample renders AND is detected as the right payload kind.
// Asserting the kind (not just pixels) catches misdetection / accidental carve fall-through.
//
// Committed `sample/` is a SUBSET of the format taxonomy - no `hashed-jpeg`,
// `catalog-dib`/ehthumbs, `irfanview-*`, or `catalog-jpeg-guid` sample is committed.
// Full-taxonomy parsing/decode regression stays at the `src/core` `node --test` tier
// (synthetic fixtures + gitignored real corpus); this spec does not duplicate it.
const HEALTHY = [
  { sample: 'Thumbs.db', kind: 'jpeg' },
  { sample: 'Thumbs-real.db', kind: 'jpeg' },
  { sample: 'Thumbs-winxp.db', kind: 'abbrev-jpeg' },
  { sample: 'Thumbs-png.db', kind: 'png' },
  { sample: 'photothumb.db', kind: 'jpeg' }, // exercises the async path-open / SQLite route
  { sample: 'thumbcache_96.db', kind: 'rgba' }, // thumbcache CMMM, small bucket: BMP-V5 alpha -> rgba
  { sample: 'thumbcache_1280.db', kind: 'jpeg' }, // thumbcache CMMM, large bucket: JPEG
]

for (const { sample, kind } of HEALTHY) {
  test.describe(sample, () => {
    test.use({ sample })

    test(`renders + detects ${kind}`, async ({ page, grid, preview }) => {
      await grid.waitForThumbnails()
      expect(await grid.count()).toBeGreaterThan(0)
      expect(await grid.payloadKindOf(0)).toBe(kind)

      await grid.select(0)
      await preview.awaitDecoded()

      await expect(page.getByTestId('recovery-banner')).toHaveCount(0) // healthy: no carve
    })
  })
}

// thumbcache small bucket: the rgba (transparent) payload draws the checkerboard backdrop in preview.
test.describe('thumbcache_96.db transparency', () => {
  test.use({ sample: 'thumbcache_96.db' })

  test('shows the checkerboard backdrop behind a transparent thumbnail', async ({ page, grid, preview }) => {
    await grid.waitForThumbnails()
    await grid.select(0)
    await preview.awaitDecoded()
    await expect(page.getByTestId('preview-checkerboard')).toBeVisible()
  })
})

// Corrupt container: the parser carves raw JPEG runs (10 thumbnails, positional `#n`
// labels, no dates) -> recovered: true -> the amber recovery banner is shown.
test.describe('Thumbs-corrupt.db', () => {
  test.use({ sample: 'Thumbs-corrupt.db' })

  test('recovers carved thumbnails + shows recovery banner', async ({ page, grid, preview }) => {
    await grid.waitForThumbnails()
    expect(await grid.count()).toBeGreaterThan(0)

    await grid.select(0)
    await preview.awaitDecoded()

    await expect(page.getByTestId('recovery-banner')).toBeVisible()
  })
})
