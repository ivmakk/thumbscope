# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Windows Explorer thumbnail cache** (`thumbcache_*.db`) support: reads the flat `CMMM` container across its layout versions, decoding JPEG, PNG, and raw BGRA thumbnails; refuses the `IMMM` index and carves orphaned entries as recovered.
- **PhotoScape SQLite cache** (`photothumb.db`) support: opens the SQLite-3 thumbnail database directly (not an OLE2 container) and extracts its stored JPEGs.
- **PNG-payload hashed `Thumbs.db`** (`hashed-png`) support: hashed-layout databases whose thumbnails are PNG rather than JPEG.
- **Faithful color for Windows XP abbreviated-JPEG** (`abbrev-jpeg`) thumbnails: reconstructs the headerless JPEG and decodes the 4-component payload with correct colors instead of a mangled image.
- Help menu with keyboard access and accelerators in the menubar.
- Table view: resizable / auto-fit columns and a file-order number column.

### Changed

- Thumbnails now render through a `thumb://` protocol so large databases stay responsive.

### Fixed

- Recover thumbnails when the container is only half-read from a damaged file.
- Reset scroll position on open; responsive preview toolbar; grid label clipping.

## [1.1.0] - 2026-06-22

### Added

- macOS (Apple Silicon / arm64) build: unsigned `.dmg` and `.zip` via `npm run dist:mac`.
- macOS `thumbscope` CLI launcher bundled in the app; symlink it onto your `PATH` to use the CLI from a terminal.
- Release CI now builds and publishes Windows and macOS artifacts together on tagged releases; manual workflow runs produce downloadable build artifacts without publishing.

### Notes

- macOS builds are unsigned/un-notarized - on first launch use right-click → **Open** (or `xattr -dr com.apple.quarantine /Applications/Thumbscope.app`). Intel (x64) Macs are not supported yet.

## [1.0.0] - 2026-06-21

First public release.

### Added

- Desktop (GUI) app to open, browse, and export thumbnails from proprietary thumbnail-cache databases.
- Supported formats: classic `Thumbs.db` (Windows 2000 / XP), modern `Thumbs.db` (Windows Vista / 7), `ehthumbs.db`, and IrfanView `ivThumbs.db` (flat + nested).
- Two-pane browsing (thumbnail grid or list) with a larger preview; images load lazily for large databases.
- Export to a folder as JPEG - stored original or resized/upscaled - with optional CSV metadata.
- Recovery fallback: carves raw JPEGs from truncated or partly-corrupt containers.
- `thumbscope` CLI with `list` and `export` commands.
- Windows NSIS installer with optional context-menu entries and an optional `thumbscope` CLI on PATH.

[Unreleased]: https://github.com/ivmakk/thumbscope/compare/v1.1.0...develop
[1.1.0]: https://github.com/ivmakk/thumbscope/releases/tag/v1.1.0
[1.0.0]: https://github.com/ivmakk/thumbscope/releases/tag/v1.0.0
