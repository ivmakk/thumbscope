# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Thumbscope is a cross-platform Electron + React + TypeScript desktop app to open classic Windows `Thumbs.db` / `ehthumbs.db` thumbnail databases, browse them in a two-panel UI (grid/table on the left, single-image preview on the right), and export thumbnails to a folder as JPEGs (stored original or resized/upscaled). A `thumbscope` CLI ships alongside the GUI for terminal use.

The app is scaffolded and functional. The phased plan and full validation evidence live in **`docs/local/project-definition.md`** (gitignored, local-only — contains real paths) — read it for the roadmap and the per-variant format analysis. Tick off / update its checkboxes as work completes.

## Locked stack decisions

Decided deliberately; don't relitigate without reason.

- **Node 24** (`.nvmrc` + `engines`). nvm-windows does not auto-read `.nvmrc`; run `nvm use 24.x` manually. Node 24 strips TS types natively, which is why `node --test` runs `.ts` files directly.
- **TypeScript** everywhere (main, preload, renderer, core, CLI).
- **electron-vite** build (Vite renderer + esbuild main/preload).
- **React 19 + Tailwind v4 + shadcn/ui** for the renderer. shadcn primitives are **vendored** into `src/renderer/src/components/ui/`, not an npm dependency.
- **`cfb`** reads the OLE2 container; a custom parser sits on top.
- **`sharp`** (Node side only) for resize/convert on export. Native module — must be `asarUnpack`ed and ABI-matched to Electron when packaging.
- **`commander`** for the CLI; **`node --test`** as the test runner (zero deps).

## Commands

- `npm run dev` — electron-vite dev server + Electron (renderer HMR).
- `npm run build` — production build into `out/`. Does **not** type-check.
- `npm run typecheck` — `tsc --noEmit` for both projects (node + web). Run this separately.
- `npm test` — `node --test "src/**/*.test.ts"`.
- Single test file: `node --test src/core/parser.test.ts`.
- `npm run cli -- <args>` — run the CLI from source (e.g. `npm run cli -- list sample/Thumbs.db`).
- `npm run build:icons` — regenerate the icon set from `build/icon.svg` (see Branding).
- `npm run dist:win` — full Windows installer (build + CLI bundle + electron-builder NSIS) → `release/`.
- `npm run pack:dir` — unpacked build (no installer) for quick inspection.

## Architecture

Three Electron layers plus a shared core, all TypeScript:

- **`src/core/`** — pure, platform-agnostic logic shared by main and CLI. **No Electron or DOM imports** (keep it that way — it's what lets the CLI and unit tests reuse it).
  - `parser.ts` — `parseThumbsDb(buffer)`: the unified parser for every variant (see below).
  - `image.ts` — `payloadToImage()`: normalize a parsed payload to displayable bytes (JPEG passthrough; DIB → BMP wrapper).
  - `encode.ts` / `export.ts` — export pipeline (`exportEntries`, `SizeMode`, JPEG encode via sharp).
  - `shell.ts` — `resolveDbPath()` (accepts a folder, finds its Thumbs.db), `firstPathArg()` (argv parsing for shell launches).
  - `view.ts` — filter/sort/selection helpers, kept in core so they're unit-tested without a DOM.
  - `types.ts`, `fixture.ts` — shared types and the committable synthetic CFB fixture used by tests.
- **`src/main/index.ts`** — Node process. Owns the window, the IPC handlers (`open-file`, `open-path`, `get-image`, `export-thumbs`, `open-folder`, `copy-text`, `window-action`), single-instance handling, and shell-launch open (file association / context menu / second instance) pushed to the renderer via the `shell-open` channel. `cfb` and `sharp` are Node-only and live here.
- **`src/preload/index.ts`** — the `contextBridge` API surface (`window.api`). Every renderer↔main call goes through a typed method here; `contextIsolation: true`. This is the IPC contract — keep it in sync with the main handlers.
- **`src/renderer/`** — sandboxed React page. `App.tsx` is the shell; `components/` holds the menubar, grid (`BrowseGrid`), table (`BrowseTable`), preview, export dialog, and vendored `components/ui/` primitives. Thumbnails are **lazily fetched per stream** over IPC (`lib/imageCache.ts`) — the open result carries metadata only, not image bytes, so large DBs stay responsive.
- **`src/cli/`** — `commander` CLI (`index.ts`, `commands.ts`) calling straight into `src/core`.

Data flow: main parses a file into `ThumbEntry[]` (held in a `Map` keyed by stream name) and returns lightweight `ThumbMeta` to the renderer; the renderer pulls image bytes on demand via `get-image`; export sends selected stream names back to main, which runs sharp.

### Thumbs.db format (core domain knowledge)

Classic `Thumbs.db` is an **OLE2 / Compound File Binary** container (magic `D0 CF 11 E0 A1 B1 1A E1`), read with `cfb`. Inside:

- A **`Catalog`** stream: header + one entry per thumbnail with an item ID, a **FILETIME** timestamp, and the original filename as **UTF-16LE**. Only source of real filenames.
- **Numbered streams** holding each thumbnail's bytes. Stream names are the item-ID **digits reversed** (index 12 → stream `"21"`). Only digit-named streams are thumbnails; ignore others (e.g. the SheetJS watermark stream the `cfb` writer injects).

Thumbnail payloads are a plain JPEG or a JPEG behind a small Microsoft "thumbstream" header. Extract robustly by scanning for the SOI marker `FF D8 FF` and slicing from there (do **not** parse the MS header).

**`Thumbs.db` spans several internal formats — all supported.** The (gitignored) corpus in `tests/fixtures/real/` has each:

- **A — classic JPEG, real filenames**: 16-byte catalog header, JPEG payloads, UTF-16LE names. The core case.
- **B — classic JPEG, GUID names**: same as A, but catalog "names" are GUIDs (`{…}`) — fall back to item ID for export naming.
- **C — Vista/7 "modern"**: stream names `<size>_<hash>` (e.g. `256_…`), **no Catalog**, no filenames — use the hash as label. Real sample payload is **JPEG behind a 24-byte MS prefix** (`headerSize=24`, `width=0`, SOI at offset 24); the SOI scan strips it. Confirmed 194/194.
- **Type 1 (Windows XP "headerless")**: classic catalog/stream layout (real filenames, digit-reversed names), but each payload is an **abbreviated JPEG** — `SOI + SOF0 + scan`, with **no DQT and no DHT** (Windows supplied them implicitly). The SOF tags **4 components `R,G,B,A` (`52 47 42 41`)**; despite the "CMYK" lore, the samples are plain 8-bit RGB stored in **reversed channel order** with an unused 4th plane, bottom-up. A browser (or a plain JPEG decode) can't render a tableless 4-component frame, so names showed without images. `isType1Jpeg` detects the exact RGBA component signature; `reconstructType1` (sync, cheap — runs at parse) splices the standard blocks Windows omits around the stream's SOF+scan: `SOI+APP0 | two DQT tables (luma id 0 + chroma id 1) | SOF | DC+AC Huffman | scan`. **No Adobe APP14** — our own decoder reads the four components directly. The result is stored as a `cmyk` payload (the reconstructed JPEG bytes; the kind name is a historical misnomer). A self-contained baseline decoder, `decodeType1Rgb` in `src/core/jpegType1.ts` (pure, no sharp/DOM), does the actual decode lazily: it reads the raw component samples and maps **`R = c2, G = c1, B = c0`** (reversed order, **no complement**), **ignoring the 4th plane**, flipping vertically (bottom-up storage) — returning upright packed RGB. `renderCmyk` (display, via get-image) and the `encodeJpeg` cmyk branch (export) both call it, then hand the RGB to sharp (PNG / JPEG; **no `.flip()`** — the decoder already flipped). Decoding only what's viewed keeps parse fast and memory low on big files; subsampled / non-baseline frames throw and the entry falls back to listing-only; reconstruction failure falls back to raw JPEG bytes (entry still lists). The transform was reverse-engineered from the reference tool **thumbsviewer** (BSD-3-Clause; standard Annex-K tables aren't copyrightable), which reads these via Windows GDI+ `LockBits(32bppCMYK)` then takes `255-C/M/Y` — GDI+ pre-inverts the raw samples, so the two inversions cancel to this plain reversed copy. **Validated ±1 per channel against GDI+ on real XP samples** (from the gitignored corpus); the earlier `255-c` complement was wrong (inverted day↔dusk, green↔magenta) and sharp's generic CMYK→RGB is worse still (applies the 4th plane → near-black). Routed inside `classify` (DIB → Type 1 → JPEG passthrough).
- **ehthumbs.db**: like classic but catalog header is **8 bytes** and payloads are raw **24bpp DIB**. The one variant that needs DIB decoding.
- **ivThumbs.db (IrfanView)**: also an OLE2 container, marked by a `_Thumbs_DB_Ver` stream and **no Catalog**. Each thumbnail is a stream **named with the original filename directly** (real names, no reversal); payload is a **16-byte prefix (8-byte FILETIME + two u32 flags) followed by a complete BMP file** (`BM`…, BITMAPINFOHEADER, 24/32bpp). The parser strips the 16-byte prefix and decodes the BMP to the same packed-RGB `dib` payload used by ehthumbs, so display/export are uniform; the FILETIME gives real dates. Confirmed 109/109 on a real flat sample. A second **nested** IrfanView sub-variant stores each filename as a CFB *storage* whose directory entry has the stream size but **no start sector** (objType 0, start = ENDOFCHAIN), so the standard reader can't reach the bytes — but the `[prefix + BMP]` blocks still sit in the file as a regular grid, so `parseIrfanViewNested` carves them directly (a `BM`+BITMAPINFOHEADER preceded by a prefix whose two trailing u32 flags are both 1; a spurious leading/overlapping hit is dropped). Filenames come from the directory in order and are paired to carved blocks **only when the counts match exactly** (best-effort — without start sectors the mapping isn't guaranteed); otherwise positional `#n` labels. Per-block FILETIME still gives dates. Confirmed 42/42 on a real nested sample. Both detected by the version stream and routed before the classic path: flat (`parseIrfanView`) first, then nested.

DIB payload (24-byte header): `u32 headerSize@0`, **signed `i32 stride@8`** (negative = bottom-up, abs = bytes/row), `u32 width@12`, `height@16`, `imageSize@20`; channels = `abs(stride) >= width*4 ? 4 : 3` (24bpp BGR or 32bpp BGRA). The parser normalizes to top-down packed RGB; `image.ts` wraps to BMP for display, sharp ingests RGB on export. Confirmed visually on both real ehthumbs samples (small = 24bpp bottom-up, mid = 32bpp top-down).

`parser.ts` is **one unified parser** for all of the above: honor the real catalog header length (8 or 16 — don't clamp), accept both stream-name shapes (digit-reversed and `<size>_<hash>`), route payloads **DIB-first but strict** (header 24 AND w>0 AND h>0 AND pixels fit) else JPEG. Edge inputs (16 KB of zeros, macOS `._` stubs) are not CFB — `CFB.read` throws; reject without crashing. **Recovery fallback:** when the container is unreadable (truncated / half-downloaded / partly corrupt) *and* raw JPEG bytes survive, the parser carves `FF D8 FF`…`FF D9` runs from the whole buffer and returns them with `recovered: true` (positional `#n` labels, no catalog metadata — filenames/dates/DIBs are lost with the container). Carving runs only as a fallback (container throws, or normal parse finds zero thumbs), never on healthy files; the renderer shows an amber recovery banner. Do not assume other variant filenames (`Image.db`, etc.) share any layout; verify per format. Full evidence in `docs/local/project-definition.md`.

## UI / branding notes

- **Design system**: `DESIGN.md` (repo root) is the living design-rules doc — color/typography/spacing/elevation tokens, component conventions, and do/don'ts. Read and update it when changing the look.
- **Theme** (`src/renderer/src/index.css`): shadcn token surface split — `--background` is a warm off-white canvas (dark grey in dark mode), `--card` is white/lighter for elevated surfaces. When adding components, chrome/controls use `bg-card`; the workspace stays on the canvas. Light/dark/system theme is controlled from the View menu (`lib/theme.ts` + Electron `nativeTheme`). UI font is self-hosted Inter (`@fontsource-variable/inter`).
- **Menubar**: the native Electron menu is disabled (`Menu.setApplicationMenu(null)`); a custom themed menubar (`components/MenuBar.tsx` + vendored `components/ui/menubar.tsx`) replaces it for a compact Win11-app look. Menu actions route through `window.api.windowAction(...)` / dedicated IPC; accelerators (Ctrl+O/E, F11/F12) are re-implemented as renderer keydown handlers in `App.tsx`.
- **Icons**: `build/icon.svg` is the master. `scripts/build-icons.mjs` rasterizes it (sharp) and emits `build/icon.ico` (multi-res), `build/icon.icns`, and `src/renderer/icon.png`. electron-builder embeds the icon into the exe, which flows to shortcuts/context-menu/ARP. Regenerate only when the art changes.

## Packaging notes

- `sharp` is native: `asarUnpack`ed and ABI-matched to Electron (electron-builder handles the rebuild).
- The `thumbscope` CLI ships inside the installer and runs through the bundled Electron binary in Node mode (`ELECTRON_RUN_AS_NODE`); the NSIS wrapper sets `NODE_PATH` to cover both unpacked and packed `node_modules`. See `build/installer.nsh` (context-menu/ProgID registration, version-aware upgrade/reinstall/downgrade notice, optional PATH entry for the CLI).
- `dist:win` gotcha: Defender can transiently lock the freshly signed exe → `EPERM rename win-unpacked.tmp`. Fix: delete `release/win-unpacked.tmp` and rerun.

## Conventions and constraints

- **Never commit real `Thumbs.db` / `ehthumbs.db` sample files** — they contain personal photos. Real local samples live (gitignored) in `tests/fixtures/real/` (see `tests/fixtures/README.md`). Tests use the committable synthetic fixture (`src/core/fixture.ts`). `sample/Thumbs.db` is a committed **synthetic, SFW** 100-thumbnail file for manual GUI testing (generator: `scripts/make-sample-thumbsdb.mjs`). The same generator has two photo modes over the CC0/PD pack in `sample/images/`: `--real` (classic JPEG → `sample/Thumbs-real.db`) and `--winxp` (XP "Type 1" abbreviated CMYK streams → `sample/Thumbs-winxp.db`, via the dev-only baseline encoder `scripts/lib/encode-type1.mjs` — the inverse of `decodeType1Rgb`). All committed samples are SFW/CC0. A Windows `.gitignore` template ignores `Thumbs.db` globally — when one is added, add `!sample/Thumbs.db`; the other sample names (`Thumbs-real.db`, `Thumbs-winxp.db`, `Thumbs-corrupt.db`) aren't matched by that pattern, so they need no exception.
- **Privacy: this is a public repository — keep contributor-private and location-revealing data out of it.** Tracked files (code, docs, comments, fixtures, commit messages) must never contain a contributor's real local filesystem paths (drive letters, `E:\…`, `/home/<user>/…`, `/Users/<user>/…`), IP addresses, personal names, or anything that identifies a real person or place. This protects everyone who contributes, not just the original author. Use neutral placeholders instead: `<corpus>`, `/path/to/sample`, `192.0.2.0` (RFC 5737), `Example User`. Keep anything with real values **gitignored**: raw research/surveys go in `docs/local/` (or a `*.local.md` file) — never in tracked `docs/`; real sample files go in `tests/fixtures/real/`; machine-specific notes go in `CLAUDE.local.md`. Sanitize tracked docs as you write them. The public/private split is a release requirement — verify it holds on every commit, and before opening a PR review your diff for any of the above.
- **License: GPL-3.0-only.** The project is GPL-3.0 (see `LICENSE`, verbatim canonical text — never edit it; `package.json` `"license": "GPL-3.0-only"`). The root `LICENSE` plus the `package.json` license field is enough — **per-file SPDX/license headers are not required** (intentionally skipped to avoid header boilerplate). Contributions are accepted under `CONTRIBUTING.md` (inbound = GPL-3.0 + a relicensing grant + DCO sign-off), which preserves the ability to dual-license/relicense later.
- **Non-destructive**: never write to the source `.db`.
- Parser must handle **non-ASCII (UTF-16) filenames** (Cyrillic confirmed) and **never crash on truncated/corrupt files** — skip-and-log per entry, report a failed count.
- `.db` is not unique to Thumbs.db (SQLite etc.), so do **not** force a default file association on `.db`. Context-menu entries only; association is opt-in in the installer.
- Keep `src/core` free of Electron/DOM imports.
- Do not commit automatically — the user commits manually.
- **Issue linkage**: branch as `feat/<N>-<slug>` (bare number, no `#`). Keep the conventional-commit subject and add `Refs #<N>` in the commit footer + PR body to cross-link without auto-closing. Don't use closing keywords (`Closes/Fixes/Resolves`) — issues are closed manually.
