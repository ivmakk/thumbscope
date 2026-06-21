# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/ivmakk/thumbscope/releases/tag/v1.0.0
