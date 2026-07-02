# Copilot instructions for Thumbscope

Thumbscope is a cross-platform Electron + React + TypeScript desktop app that opens classic Windows `Thumbs.db` / `ehthumbs.db` thumbnail databases (and related caches), browses them in a two-panel UI, and exports thumbnails as JPEGs. A `thumbscope` CLI ships alongside the GUI. Stack: Node 24, TypeScript everywhere, electron-vite build, React 19 + Tailwind v4 + vendored shadcn/ui, `cfb` for OLE2 parsing, `sharp` for image encode, `commander` for the CLI, `node --test` + Vitest + Playwright for tests.

When reviewing a pull request, focus on the points below. Flag violations; do not restate praise for code that merely follows them.

## Architecture boundaries

- `src/core/` is pure, platform-agnostic logic shared by main and CLI. It must have **no Electron or DOM imports**. The only allowed Node-only exceptions are the `sharp`-using `encode.ts` and `formats/codec/decode.ts`, the `node:sqlite`-using `photothumb.ts`, and `cfb`. Flag any new Electron/DOM/renderer import that leaks into `src/core/`.
- The renderer is sandboxed (`contextIsolation: true`). All renderer to main communication must go through the typed `window.api` surface in `src/preload/index.ts`, routed through the IPC contract in `src/shared/ipc.ts`. Flag direct `ipcRenderer` use in the renderer or channel strings that bypass `CHANNELS` / `PUSH`.
- `src/shared/ipc.ts` is the single source of truth for IPC channel names and payload types. A channel rename or new channel should touch this file, main, and preload together. `src/ipc-contract.test.ts` asserts every `CHANNELS` key has a matching `ipcMain.handle`; a new invoke channel needs a handler.
- Thumbnails render via a `thumb://` `<img>` src, not by pulling image bytes over IPC. The open result carries metadata only. Flag reintroduction of byte-pull IPC for images or a hand-managed blob cache.

## Format-parsing correctness (the core domain)

- Parsing lives under `src/core/formats/`. The orchestrator is `open.ts`; container handlers register in `registry.ts`; payload codecs live in `codec/`. New OLE2-family formats should register as a `ContainerHandler` with a positive `detect()` signature rather than being special-cased in the orchestrator.
- The parser must **never crash on truncated or corrupt files**. It skips-and-logs per entry and reports a failed count. Flag new parsing code that can throw on malformed input without being caught, or that assumes a field is present.
- The parser must handle non-ASCII (UTF-16LE) filenames. Do not assume ASCII when decoding catalog names.
- The catalog header length is real (8 or 16 bytes depending on variant) and must not be clamped or hardcoded to one value.
- Tier-2 carve recovery runs **only** when the container throws, no handler matched, or a parse found zero thumbs. It must never run on healthy files. Flag changes that broaden when carving triggers.
- Always treat the source `.db` as read-only; the app is strictly non-destructive. Flag any write, truncate, or open-for-write against an input path.
- Format byte offsets and header layouts in `formats/open.ts`, the container handlers, and `codec/abbrevJpeg.ts` are subtle and version-dependent; scrutinize any changed offset, length, or magic-byte constant for off-by-one and wrong-variant errors.

## Privacy and licensing (public repo, release-blocking)

- This is a public repository. Tracked files (code, docs, comments, fixtures, commit messages) must **never** contain a contributor's real local filesystem paths (drive letters, `E:\...`, `/home/<user>/`, `/Users/<user>/`), IP addresses, personal names, or anything identifying a real person or place. Use neutral placeholders (`<corpus>`, `/path/to/sample`, `192.0.2.0`, `Example User`). Flag any such leak - this is a hard blocker.
- **Never add real `Thumbs.db` / `ehthumbs.db` sample files** to the repo; they contain personal photos. Tests use the synthetic fixture (`src/core/fixture.ts`); committed `sample/*.db` are synthetic and CC0.
- License is GPL-3.0-only. Do not edit the `LICENSE` file. Per-file SPDX headers are intentionally not used, so do not request them. Do not transcribe code from the reverse-engineering references (Thumbs Viewer, ThumbnailExpert) - reimplement from format understanding only.

## Testing conventions

- The file extension picks the runner: `*.test.ts` runs under `node --test` (pure logic, no DOM), `*.test.tsx` runs under Vitest (component render, happy-dom), `*.spec.ts` under `e2e/` runs under Playwright (real Electron app).
- Prefer extracting pure logic into `src/renderer/src/lib/` and testing it under `node --test`. Reserve `.test.tsx` for what genuinely needs a browser and E2E for what needs the whole app. Flag a new `.test.tsx` or E2E spec that could have been a cheap `node --test`.
- New parsing behavior or a bug fix in `src/core/` should come with a test. `npm test` and `npm run typecheck` must pass.

## Style

- Match the surrounding code's naming, idiom, and comment density. Prefer static top-level imports; avoid dynamic `import()` and inline `import('x').Type` unless there is a concrete reason (code-splitting, breaking a require cycle, deferring a Node-only module).
- No process-scaffolding comments in code (no "Phase 2", step numbers, or ticket IDs). Comments explain the code, not the workflow.
- Keep changes surgical. Flag unrelated refactors, reformatting, or "improvements" to adjacent code that are not part of the PR's stated purpose.
- In Markdown files, use plain hyphens, not em-dashes, and do not hard-wrap paragraphs.
