# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-06-22

### Added

- macOS (Apple Silicon / arm64) build: unsigned `.dmg` and `.zip` via `npm run dist:mac`.
- macOS `thumbscope` CLI launcher bundled in the app; symlink it onto your `PATH` to use the CLI from a terminal.
- Release CI now builds and publishes Windows and macOS artifacts together on tagged releases; manual workflow runs produce downloadable build artifacts without publishing.

### Notes

- macOS builds are unsigned/un-notarized — on first launch use right-click → **Open** (or `xattr -dr com.apple.quarantine /Applications/Thumbscope.app`). Intel (x64) Macs are not supported yet.

## [1.0.0] - 2026-06-21

First public release.

### Added

- Desktop (GUI) app to open, browse, and export thumbnails from proprietary thumbnail-cache databases.
- Supported formats: classic `Thumbs.db` (Windows 2000 / XP), modern `Thumbs.db` (Windows Vista / 7), `ehthumbs.db`, and IrfanView `ivThumbs.db` (flat + nested).
- Two-pane browsing (thumbnail grid or list) with a larger preview; images load lazily for large databases.
- Export to a folder as JPEG — stored original or resized/upscaled — with optional CSV metadata.
- Recovery fallback: carves raw JPEGs from truncated or partly-corrupt containers.
- `thumbscope` CLI with `list` and `export` commands.
- Windows NSIS installer with optional context-menu entries and an optional `thumbscope` CLI on PATH.

[1.1.0]: https://github.com/ivmakk/thumbscope/releases/tag/v1.1.0
[1.0.0]: https://github.com/ivmakk/thumbscope/releases/tag/v1.0.0
