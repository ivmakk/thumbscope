# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Thumbscope is a cross-platform Electron + React + TypeScript desktop app to open classic Windows `Thumbs.db` / `ehthumbs.db` thumbnail databases, browse them in a two-panel UI (grid/table on the left, single-image preview on the right), and export thumbnails to a folder as JPEGs (stored original or resized/upscaled). A `thumbscope` CLI ships alongside the GUI for terminal use.

The app is scaffolded and functional. The phased plan and full validation evidence live in **`docs/local/project-definition.md`** (gitignored, local-only - contains real paths) - read it for the roadmap and the per-variant format analysis. Tick off / update its checkboxes as work completes.

## Locked stack decisions

Decided deliberately; don't relitigate without reason.

- **Node 24** (`.nvmrc` + `engines`). nvm-windows does not auto-read `.nvmrc`; run `nvm use 24.x` manually. Node 24 strips TS types natively, which is why `node --test` runs `.ts` files directly.
- **TypeScript** everywhere (main, preload, renderer, core, CLI).
- **electron-vite** build (Vite renderer + esbuild main/preload).
- **React 19 + Tailwind v4 + shadcn/ui** for the renderer. shadcn primitives are **vendored** into `src/renderer/src/components/ui/`, not an npm dependency.
- **`cfb`** reads the OLE2 container; a custom parser sits on top.
- **`sharp`** (Node side only) for resize/convert on export. Native module - must be `asarUnpack`ed and ABI-matched to Electron when packaging.
- **`commander`** for the CLI; **`node --test`** as the test runner (zero deps).

## Commands

- `npm run dev` - electron-vite dev server + Electron (renderer HMR).
- `npm run build` - production build into `out/`. Does **not** type-check.
- `npm run typecheck` - `tsc --noEmit` for both projects (node + web). Run this separately.
- `npm test` - `node --test "src/**/*.test.ts"`.
- Single test file: `node --test src/core/parser.test.ts`.
- `npm run cli -- <args>` - run the CLI from source (e.g. `npm run cli -- list sample/Thumbs.db`).
- `npm run build:icons` - regenerate the icon set from `build/icon.svg` (see Branding).
- `npm run dist:win` - full Windows installer (build + CLI bundle + electron-builder NSIS) → `release/`.
- `npm run pack:dir` - unpacked build (no installer) for quick inspection.

## Architecture

Three Electron layers plus a shared core, all TypeScript:

- **`src/core/`** - pure, platform-agnostic logic shared by main and CLI. **No Electron or DOM imports** (keep it that way - it's what lets the CLI and unit tests reuse it).
  - `parser.ts` - `parseThumbsDb(buffer)`: the unified parser for every variant (see below).
  - `image.ts` - `payloadToImage()`: normalize a parsed payload to displayable bytes (JPEG passthrough; DIB → BMP wrapper).
  - `encode.ts` / `export.ts` - export pipeline (`exportEntries`, `SizeMode`, JPEG encode via sharp).
  - `shell.ts` - `resolveDbPath()` (accepts a folder, finds its Thumbs.db), `firstPathArg()` (argv parsing for shell launches).
  - `view.ts` - filter/sort/selection helpers, kept in core so they're unit-tested without a DOM.
  - `types.ts`, `fixture.ts` - shared types and the committable synthetic CFB fixture used by tests.
- **`src/main/index.ts`** - Node process. Owns the window, the IPC handlers (`open-file`, `open-path`, `get-image`, `export-thumbs`, `open-folder`, `copy-text`, `window-action`), single-instance handling, and shell-launch open (file association / context menu / second instance) pushed to the renderer via the `shell-open` channel. `cfb` and `sharp` are Node-only and live here.
- **`src/preload/index.ts`** - the `contextBridge` API surface (`window.api`). Every renderer↔main call goes through a typed method here; `contextIsolation: true`. This is the IPC contract - keep it in sync with the main handlers.
- **`src/renderer/`** - sandboxed React page. `App.tsx` is the shell; `components/` holds the menubar, grid (`BrowseGrid`), table (`BrowseTable`), preview, export dialog, and vendored `components/ui/` primitives. Thumbnails are **lazily fetched per stream** over IPC (`lib/imageCache.ts`) - the open result carries metadata only, not image bytes, so large DBs stay responsive.
- **`src/cli/`** - `commander` CLI (`index.ts`, `commands.ts`) calling straight into `src/core`.

Data flow: main parses a file into `ThumbEntry[]` (held in a `Map` keyed by stream name) and returns lightweight `ThumbMeta` to the renderer; the renderer pulls image bytes on demand via `get-image`; export sends selected stream names back to main, which runs sharp.

### Thumbs.db format (core domain knowledge)

Classic `Thumbs.db` is an **OLE2 / Compound File Binary** container (magic `D0 CF 11 E0 A1 B1 1A E1`), read with `cfb`. A **`Catalog`** stream holds per-thumbnail metadata (item ID, FILETIME, original filename as UTF-16LE - the only source of real filenames); **numbered streams** (item-ID digits reversed: index 12 → stream `"21"`) hold the bytes. Payloads are a plain JPEG or a JPEG behind a small MS "thumbstream" header - extract by scanning for the SOI marker `FF D8 FF` and slicing from there (do **not** parse the MS header).

**`Thumbs.db` spans several internal formats - all supported.** Variant taxonomy (the triage vocabulary used in issues/PRs); a real sample of each lives in the gitignored corpus `tests/fixtures/real/`. The **slug** is the canonical key (these are project conventions - Microsoft never documented the internals; the slugs supersede the former ambiguous `A`/`B`/`C`/`Type 1` labels):

| Slug | Display name | Key trait | Code / payload kind |
|---|---|---|---|
| `catalog-jpeg` | Classic JPEG (Win2000/XP) | 16-byte catalog header, UTF-16LE names | JPEG passthrough |
| `catalog-jpeg-guid` | Classic JPEG, GUID names | catalog "names" are GUIDs (`{…}`) → fall back to item ID | JPEG passthrough |
| `hashed-jpeg` | Modern JPEG (Vista/7) | stream names `<size>_<hash>`, **no Catalog** | JPEG (24-byte MS prefix, stripped by SOI scan) |
| `hashed-png` | Hashed PNG | hashed layout (`<size>_<hash>`, no Catalog) but PNG payloads | PNG (24-byte MS prefix, stripped by signature scan) → `png` passthrough |
| `abbrev-jpeg` | XP abbreviated JPEG | `SOI+SOF0+scan`, no DQT/DHT, 4-component RGBA signature | `reconstructAbbrevJpeg` + `decodeAbbrevRgb` (`jpegAbbrev.ts`) → `abbrev-jpeg` kind |
| `catalog-dib` | ehthumbs media (DIB) | `ehthumbs.db`, 8-byte catalog header | raw 24bpp `dib` |
| `irfanview-flat` | IrfanView (flat) | `_Thumbs_DB_Ver` stream, no Catalog, streams named by filename | 16-byte prefix + BMP → `dib` (`parseIrfanView`) |
| `irfanview-nested` | IrfanView (nested) | filenames are CFB storages with no start sector | carve `[prefix+BMP]` grid (`parseIrfanViewNested`) |
| `recovered` | Recovered (carved) | unreadable container, raw JPEGs (or PNGs) survive | carved `FF D8`…`FF D9` (or PNG runs when no JPEG survives), `recovered: true` |

`parser.ts` is **one unified parser**: honor the real catalog header length (8 or 16 - don't clamp), accept both stream-name shapes (digit-reversed and `<size>_<hash>`), route payloads **DIB-first but strict** (header 24 AND w>0 AND h>0 AND pixels fit) then PNG (signature scan, before JPEG so a PNG body's stray `FF D8 FF` isn't mis-sliced) else JPEG. Edge inputs (16 KB of zeros, macOS `._` stubs) are not CFB - `CFB.read` throws; reject without crashing. **Recovery fallback** runs only when the container throws or a normal parse finds zero thumbs (never on healthy files): carve raw JPEG runs from the whole buffer (or PNG runs if no JPEG survives; positional `#n` labels, no catalog metadata); the renderer shows an amber recovery banner. Do not assume other variant filenames (`Image.db`, etc.) share any layout; verify per format.

**Full per-variant forensics - `abbrev-jpeg` reconstruction/decode algorithm and GDI+ derivation, IrfanView carving internals, DIB byte-offset layout, validation counts - live in `docs/thumbnail-db-formats.md`. Read it before editing `parser.ts` or `jpegAbbrev.ts`.** That doc also holds reference notes on the unsupported, non-OLE2 `thumbcache_*.db` format. Validation evidence: `docs/local/project-definition.md`.

## UI / branding notes

- **Design system**: `DESIGN.md` (repo root) is the living design-rules doc - color/typography/spacing/elevation tokens, component conventions, and do/don'ts. Read and update it when changing the look.
- **Theme** (`src/renderer/src/index.css`): shadcn token surface split - `--background` is a warm off-white canvas (dark grey in dark mode), `--card` is white/lighter for elevated surfaces. When adding components, chrome/controls use `bg-card`; the workspace stays on the canvas. Light/dark/system theme is controlled from the View menu (`lib/theme.ts` + Electron `nativeTheme`). UI font is self-hosted Inter (`@fontsource-variable/inter`).
- **Menubar**: the native Electron menu is disabled (`Menu.setApplicationMenu(null)`); a custom themed menubar (`components/MenuBar.tsx` + vendored `components/ui/menubar.tsx`) replaces it for a compact Win11-app look. Menu actions route through `window.api.windowAction(...)` / dedicated IPC; accelerators (Ctrl+O/E, F11/F12) are re-implemented as renderer keydown handlers in `App.tsx`.
- **Icons**: `build/icon.svg` is the master. `scripts/build-icons.mjs` rasterizes it (sharp) and emits `build/icon.ico` (multi-res), `build/icon.icns`, and `src/renderer/icon.png`. electron-builder embeds the icon into the exe, which flows to shortcuts/context-menu/ARP. Regenerate only when the art changes.

## Packaging notes

- `sharp` is native: `asarUnpack`ed and ABI-matched to Electron (electron-builder handles the rebuild).
- The `thumbscope` CLI ships inside the installer and runs through the bundled Electron binary in Node mode (`ELECTRON_RUN_AS_NODE`); the NSIS wrapper sets `NODE_PATH` to cover both unpacked and packed `node_modules`. See `build/installer.nsh` (context-menu/ProgID registration, version-aware upgrade/reinstall/downgrade notice, optional PATH entry for the CLI).
- `dist:win` gotcha: Defender can transiently lock the freshly signed exe → `EPERM rename win-unpacked.tmp`. Fix: delete `release/win-unpacked.tmp` and rerun.

## Conventions and constraints

- **Never commit real `Thumbs.db` / `ehthumbs.db` sample files** - they contain personal photos. Real local samples live (gitignored) in `tests/fixtures/real/` (see `tests/fixtures/README.md`). Tests use the committable synthetic fixture (`src/core/fixture.ts`). `sample/Thumbs.db` is a committed **synthetic, SFW** 100-thumbnail file for manual GUI testing (generator: `scripts/make-sample-thumbsdb.mjs`). The same generator has three photo modes over the CC0/PD pack in `sample/images/`: `--real` (classic JPEG → `sample/Thumbs-real.db`), `--winxp` (XP "abbrev-jpeg" abbreviated CMYK streams → `sample/Thumbs-winxp.db`, via the dev-only baseline encoder `scripts/lib/encode-abbrev.mjs` - the inverse of `decodeAbbrevRgb`), and `--png` (hashed-png layout: no Catalog, `256_<hash>` streams, 24-byte MS prefix + PNG via sharp → `sample/Thumbs-png.db`). All committed samples are SFW/CC0. A Windows `.gitignore` template ignores `Thumbs.db` globally - when one is added, add `!sample/Thumbs.db`; the other sample names (`Thumbs-real.db`, `Thumbs-winxp.db`, `Thumbs-png.db`, `Thumbs-corrupt.db`) aren't matched by that pattern, so they need no exception.
- **Privacy: this is a public repository - keep contributor-private and location-revealing data out of it.** Tracked files (code, docs, comments, fixtures, commit messages) must never contain a contributor's real local filesystem paths (drive letters, `E:\…`, `/home/<user>/…`, `/Users/<user>/…`), IP addresses, personal names, or anything that identifies a real person or place. This protects everyone who contributes, not just the original author. Use neutral placeholders instead: `<corpus>`, `/path/to/sample`, `192.0.2.0` (RFC 5737), `Example User`. Keep anything with real values **gitignored**: raw research/surveys go in `docs/local/` (or a `*.local.md` file) - never in tracked `docs/`; real sample files go in `tests/fixtures/real/`; machine-specific notes go in `CLAUDE.local.md`. Sanitize tracked docs as you write them. The public/private split is a release requirement - verify it holds on every commit, and before opening a PR review your diff for any of the above.
- **License: GPL-3.0-only.** The project is GPL-3.0 (see `LICENSE`, verbatim canonical text - never edit it; `package.json` `"license": "GPL-3.0-only"`). The root `LICENSE` plus the `package.json` license field is enough - **per-file SPDX/license headers are not required** (intentionally skipped to avoid header boilerplate). Contributions are accepted under `CONTRIBUTING.md` (inbound = GPL-3.0 + a relicensing grant + DCO sign-off), which preserves the ability to dual-license/relicense later.
- **Non-destructive**: never write to the source `.db`.
- Parser must handle **non-ASCII (UTF-16) filenames** (Cyrillic confirmed) and **never crash on truncated/corrupt files** - skip-and-log per entry, report a failed count.
- `.db` is not unique to Thumbs.db (SQLite etc.), so do **not** force a default file association on `.db`. Context-menu entries only; association is opt-in in the installer.
- Keep `src/core` free of Electron/DOM imports.
- Do not commit automatically - the user commits manually.
- **Issue linkage**: branch as `feat/<N>-<slug>` (bare number, no `#`). Keep the conventional-commit subject and add `Refs #<N>` in the commit footer + PR body to cross-link without auto-closing. Don't use closing keywords (`Closes/Fixes/Resolves`) - issues are closed manually.
