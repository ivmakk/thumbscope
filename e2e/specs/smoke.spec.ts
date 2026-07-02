import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../fixtures'

// Depth: the full pipeline against a temp copy of Thumbs.db - launch (argv open) ->
// browse -> preview decode -> export via the menubar -> assert output on disk.
test.use({ sample: 'Thumbs.db', copyToTemp: true })

test('smoke: open -> browse -> preview -> export -> output on disk', async ({
  grid,
  preview,
  menubar,
  exportDialog,
  exportDir,
}) => {
  // The committed sample is opened only as a temp copy; prove the original is untouched.
  const original = join(process.cwd(), 'sample', 'Thumbs.db')
  const before = await readFile(original)

  await grid.waitForThumbnails()
  const cells = await grid.count()
  expect(cells).toBeGreaterThan(0)

  await grid.select(0)
  await preview.awaitDecoded() // blocks on naturalWidth > 0

  await menubar.openExport()
  await exportDialog.setDestSource()
  await exportDialog.confirm()

  const summary = await exportDialog.summaryText()
  const exported = Number(summary.match(/Exported (\d+) file/)![1])
  expect(exported).toBeGreaterThan(0)

  const jpgs = (await readdir(exportDir)).filter((f) => f.toLowerCase().endsWith('.jpg'))
  expect(jpgs.length).toBe(exported)

  const first = await readFile(join(exportDir, jpgs[0]))
  expect([first[0], first[1], first[2]]).toEqual([0xff, 0xd8, 0xff]) // JPEG SOI

  // Non-destructive: the repo sample is byte-identical after the run.
  expect(Buffer.compare(await readFile(original), before)).toBe(0)
})
