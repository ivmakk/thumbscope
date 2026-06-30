import { defineConfig } from '@playwright/test'

// Unpacked Playwright `_electron` smoke + format coverage on Windows + macOS.
// One Electron app at a time (`fullyParallel: false`); no web server / browser download -
// `_electron` drives the Chromium bundled in the `electron` dep over CDP.
const ci = !!process.env.CI

export default defineConfig({
  testDir: 'specs',
  fullyParallel: false,
  workers: 1, // one Electron app at a time
  timeout: 30_000,
  retries: ci ? 2 : 0,
  reporter: ci
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    trace: 'on-first-retry',
  },
})
