import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Unpacked Playwright `_electron` smoke + format coverage on Windows + macOS.
// One Electron app at a time (`fullyParallel: false`); no web server / browser download -
// `_electron` drives the Chromium bundled in the `electron` dep over CDP.
const ci = !!process.env.CI

// Local opt-ins for the test run only (e.g. E2E_HIDE_WINDOW=1 to park the window off-screen). The
// file is gitignored, so it is absent for other contributors and CI - a no-op there. It is read
// by Playwright, not by `npm run dev`, so normal launches are unaffected.
const localEnv = join(import.meta.dirname, '.env.local')
if (existsSync(localEnv)) process.loadEnvFile(localEnv)

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
