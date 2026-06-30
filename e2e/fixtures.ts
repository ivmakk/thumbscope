import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { GridScreen } from './screens/grid'
import { PreviewScreen } from './screens/preview'
import { MenuBarScreen } from './screens/menubar'
import { ExportDialogScreen } from './screens/exportDialog'
import { TableScreen } from './screens/table'
import { ToolbarScreen } from './screens/toolbar'
import { StatusBarScreen } from './screens/statusbar'

// Playwright is invoked from the repo root (the `test:e2e` script), so cwd is the repo
// root - used both to resolve committed samples and as the launch cwd, so `electron .`
// resolves `package.json` `main` (= ./out/main/index.js) the way `npm run dev` does.
const repoRoot = process.cwd()

type Options = {
  // Sample DB: a bare filename under `sample/`, or an absolute path.
  sample: string
  // Copy the sample to a temp dir before launch, so an export-to-source-folder lands in
  // temp and the committed sample stays untouched (the smoke needs this; formats don't).
  copyToTemp: boolean
  // Fresh `--user-data-dir` per launch (default). Opt out for a persistence test.
  freshProfile: boolean
}

type Screens = {
  grid: GridScreen
  preview: PreviewScreen
  menubar: MenuBarScreen
  exportDialog: ExportDialogScreen
  table: TableScreen
  toolbar: ToolbarScreen
  statusbar: StatusBarScreen
}

type Fixtures = {
  app: ElectronApplication
  page: Page
  // Absolute path of the DB the app was launched against (a temp copy when copyToTemp).
  dbPath: string
  // Where an export-to-source-folder writes (= the DB's folder). A temp dir when copyToTemp.
  exportDir: string
} & Screens

export const test = base.extend<Options & Fixtures>({
  sample: ['Thumbs.db', { option: true }],
  copyToTemp: [false, { option: true }],
  freshProfile: [true, { option: true }],

  dbPath: async ({ sample, copyToTemp }, use) => {
    const src = isAbsolute(sample) ? sample : join(repoRoot, 'sample', sample)
    if (!copyToTemp) {
      await use(src)
      return
    }
    const dir = await mkdtemp(join(tmpdir(), 'tscope-db-'))
    try {
      const dst = join(dir, basename(src))
      await copyFile(src, dst)
      await use(dst)
    } finally {
      // maxRetries: Windows may briefly hold the copy (Defender / indexer) after the app exits.
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  },

  exportDir: async ({ dbPath }, use) => {
    // The DB's folder; export-to-source writes here. Temp dir when copyToTemp.
    await use(dirname(dbPath))
  },

  app: async ({ dbPath, freshProfile }, use) => {
    const args = ['.', dbPath]
    let profile: string | undefined
    if (freshProfile) {
      profile = await mkdtemp(join(tmpdir(), 'tscope-prof-'))
      // Chromium switch goes before the app path (canonical position); isolates the profile per launch.
      args.unshift(`--user-data-dir=${profile}`)
    }
    let app: ElectronApplication | undefined
    try {
      app = await _electron.launch({ args, cwd: repoRoot })
      await use(app)
    } finally {
      await app?.close()
      // maxRetries: Windows may briefly hold the profile (SingletonLock / GPUCache) on exit.
      if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  },

  page: async ({ app }, use) => {
    await use(await app.firstWindow())
  },

  grid: async ({ page }, use) => {
    await use(new GridScreen(page))
  },
  preview: async ({ page }, use) => {
    await use(new PreviewScreen(page))
  },
  menubar: async ({ page }, use) => {
    await use(new MenuBarScreen(page))
  },
  exportDialog: async ({ page }, use) => {
    await use(new ExportDialogScreen(page))
  },
  table: async ({ page }, use) => {
    await use(new TableScreen(page))
  },
  toolbar: async ({ page }, use) => {
    await use(new ToolbarScreen(page))
  },
  statusbar: async ({ page }, use) => {
    await use(new StatusBarScreen(page))
  },
})

export { expect } from '@playwright/test'
