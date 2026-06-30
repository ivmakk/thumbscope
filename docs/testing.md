# Testing

Thumbscope has three test tiers. Each one runs a different runner and covers a different layer, and the file extension decides which runner owns a file. This guide covers what each tier is for, how to run it, and how to add to the end-to-end suite.

## The three tiers

| Tier | Runner | Files | Covers |
|---|---|---|---|
| Unit / logic | `node --test` | `src/**/*.test.ts` | Pure logic with no DOM: the parser, format detection, the export pipeline, view filters, the IPC-contract guard. |
| Component render | Vitest + happy-dom | `src/**/*.test.tsx` | React components that need a DOM to mount. |
| End-to-end | Playwright `_electron` | `e2e/specs/*.spec.ts` | The real app: main + preload + renderer driven together, on Windows and macOS. |

The split is deliberate. The first tier is fast and has zero dependencies, so it is the default place to put logic. The third tier is slow and needs a real Electron window, so it only covers what the cheaper tiers cannot.

Prefer pulling pure logic out of a component into `src/renderer/src/lib/` and testing it under `node --test`. Reserve `.test.tsx` for behavior that genuinely needs a browser, and reserve E2E for flows that need the whole app wired up.

## Running the tiers

```sh
npm test            # node --test over src/**/*.test.ts
npm run test:core   # node --test over src/core only (inner loop)
npm run test:renderer  # vitest run, the .test.tsx component tier
npm run test:all    # node --test then vitest
npm run test:e2e    # Playwright _electron (builds first, then runs e2e/specs)
```

A single unit file:

```sh
node --test src/core/parser.test.ts
```

`npm run typecheck` covers `e2e/` as well as the node and web projects, so a type error in a spec or fixture is caught without running the slow E2E job.

## End-to-end, in more detail

The E2E tier launches the unpacked build (`out/`, what `npm run dev` runs), not the packaged installer. `npm run test:e2e` builds once through `pretest:e2e` and then runs Playwright. If `out/` is already fresh, run Playwright directly to skip the rebuild:

```sh
npx playwright test -c e2e/playwright.config.ts
```

You never run `npx playwright install`. Playwright's `_electron` drives the Chromium that ships inside the `electron` dependency over the DevTools protocol, so the browser binaries Playwright would otherwise manage are never used. CI sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on install to skip fetching them; locally `npm ci` may download them once and leave them unused, which is harmless.

Electron has no real headless mode. The Windows and macOS runners run a headed window natively, which is the same thing you see locally, so a green local run and a green CI run mean the same thing.

### Troubleshooting locally

The window is visible by default. To slow it down and watch it work, set a `slowMo` in `e2e/fixtures.ts` on the `_electron.launch` call, or open the Playwright inspector:

```sh
PWDEBUG=1 npx playwright test -c e2e/playwright.config.ts
```

On a failure during a retry, Playwright writes a trace under `test-results/`. Open it in the viewer:

```sh
npx playwright show-trace test-results/<run>/trace.zip
```

CI uploads `test-results/` as an artifact when a run fails, so a CI-only failure replays in the same local viewer.

## How the E2E suite is organized

Two spec files, split by what a red result tells you:

- `e2e/specs/smoke.spec.ts` is depth. One full pipeline against a temp copy of `Thumbs.db`: open, browse, preview, export through the menubar, then check the files on disk. A red smoke means the core path broke.
- `e2e/specs/formats.spec.ts` is breadth. One case per committed sample, checking that each format is detected and renders. A red `formats > <file>` means that one format regressed.

Specs talk to the app through screen objects, not raw locators. Each object in `e2e/screens/` wraps one surface (the grid, the preview, the menubar, the export dialog) and exposes intent-level methods like `waitForThumbnails()` or `openExport()`. The objects are injected as Playwright fixtures from `e2e/fixtures.ts`, so a spec never calls `new` on one. When a selector changes, you fix it in one screen object instead of across every spec.

Stable hooks are `data-testid` attributes (`thumb-cell`, `preview-image`, `recovery-banner`). Everything else uses accessible roles and names through `getByRole`. Reach for a testid only when there is no stable role or text.

The fixtures isolate each launch: a fresh `--user-data-dir` per app, and a temp copy of the sample when a test exports, so the committed sample files are never written to.

The committed `sample/*.db` files are a subset of the format taxonomy, so the breadth spec does not prove full-format coverage. Per-format parsing and decoding is covered at the `node --test` tier against synthetic fixtures and a local real-sample corpus. The E2E tier does not duplicate those assertions; it covers the render path and detection that only show up in a real window.

## Adding to the E2E suite

To add a format case, drop a committed, SFW sample into `sample/`, then add a row to the `HEALTHY` list in `formats.spec.ts` with its expected payload kind (the `· <kind>` label the grid shows). The existing screen objects already cover it.

To test a new surface, add a screen object under `e2e/screens/` for that surface, wire it into `e2e/fixtures.ts` as a fixture, and use it from a spec. Keep the object thin and limited to what a spec actually needs. Do not add a screen object until a spec uses it.
