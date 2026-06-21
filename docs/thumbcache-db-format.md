# thumbcache_*.db (CMMM) format — reference

> **Scope note:** This is a *different* format from what this app currently parses. We handle the classic **OLE2 / Compound File `Thumbs.db`** (and `ehthumbs.db`, and the Vista/7 "modern" `Thumbs.db` whose streams are named `<size>_<hash>` — all still inside an OLE2 container). The format below, `thumbcache_*.db`, is the per-user Windows Explorer thumbnail cache and is **not OLE2**. It is **not supported today**. Keep this doc only as a reference if/when adding `thumbcache_*.db` support — it does not describe the current `src/core/parser.ts` input.

Source: libyal/libwtcdb — [Windows Explorer Thumbnail Cache database format](https://github.com/libyal/libwtcdb/blob/main/documentation/Windows%20Explorer%20Thumbnail%20Cache%20database%20format.asciidoc). That spec is the authoritative reference; consult it (not this summary) before implementing.

## What it is

Introduced on Windows Vista, replacing per-folder `Thumbs.db` for Explorer's own cache. Lives in `%LocalAppData%\Microsoft\Windows\Explorer\` as a set of files:

- **Cache files** — `thumbcache_<size>.db` (e.g. `thumbcache_256.db`): hold the actual thumbnail bytes plus file references.
- **Index files** — `thumbcache_idx.db`: lookups/metadata mapping a thumbnail ID to entry offsets across the size-specific cache files.

Thumbnails are identified by a **ThumbnailCacheId** — a 64-bit value, stored as a hex string without leading zeros. There is no original filename in the cache itself (resolving it requires the Windows Search / property store, out of scope here).

## Where it fits — `Thumbs.db` → `thumbcache_*.db`

`thumbcache_*.db` is the **Vista-onward replacement** for the per-folder `Thumbs.db`. Two things changed across Windows versions — *where* thumbnails live and the *format* they live in:

**Location.** Windows 2000/ME/XP wrote a hidden per-folder `Thumbs.db` (plus `ehthumbs.db` for media) into every folder browsed. Vista moved the cache **out of the photo folders into one per-user store** (`%LocalAppData%\Microsoft\Windows\Explorer\`), fixing the privacy/clutter problem of `Thumbs.db` leaking filenames and thumbnails into shared folders. `Thumbs.db` is **not fully retired**, though: Vista+ still writes it to **network / remote / removable** locations (local NTFS uses the central cache), which is why modern `Thumbs.db` samples still appear — and they use a newer internal layout (see below). The behavior is controllable via the GPO "Turn off the caching of thumbnails in hidden thumbs.db files."

**Two distinct lineages.** Don't conflate them:
- The `Thumbs.db` container itself evolved: XP "classic" OLE2 with a `Catalog` stream + digit-reversed numbered streams and real UTF-16 filenames → Vista/7 "modern" OLE2 with **no Catalog** and streams named `<size>_<hash>` (DIB/JPEG payloads). **Both are OLE2 and both are already handled by `src/core/parser.ts`** (variants A/B and C).
- `thumbcache_*.db` (this doc) is a **separate, non-OLE2 format** — a flat `CMMM` cache stream. It is **not** handled today and needs its own code path.

## Signatures

- Cache file / cache entry: `CMMM` at offset 0.
- Index file: `IMMM` (at offset 4 in format 30+, offset 0 in formats 20–21).
- Format versions are version-dependent (entry/index layouts differ); the cache also gained more size buckets over time:

| Format ver | Windows | Size buckets — files `thumbcache_<bucket>.db` |
|---:|---|---|
| 20 | Vista | 32, 96, 256, 1024, sr |
| 21 | 7 | 32, 96, 256, 1024, sr |
| 30 | 8.0 | 16, 32, 48, 96, 256, 1024, sr, wide, exif |
| 31 | 8.1 | 16, 32, 48, 96, 256, 1024, 1600, sr, wide, exif, wide_alternate |
| 32 | 10 / 11 | 16, 32, 48, 96, 256, 768, 1280, 1920, 2560, sr, wide, exif, wide_alternate, custom_stream |

`iconcache_*.db` (icons) shares the same `CMMM` container. Validate against a real file **per version** — do not trust a single sample.

## Cache file header (24 bytes)

| Offset | Size | Field |
|-------:|-----:|-------|
| 0  | 4 | signature `CMMM` |
| 4  | 4 | format version |
| 8  | 4 | cache type |
| 12 | 4 | offset to first cache entry |
| 16 | 4 | offset to first available (free) entry |
| 20 | 4 | number of cache entries |

## Cache entry (variable length)

Begins with its own `CMMM` signature + size field, then:

- 8-byte entry hash (the ThumbnailCacheId).
- identifier-string size, padding size, data size.
- CRC-64 checksums for header and data.
- UTF-16 identifier string (the hex ThumbnailCacheId).
- thumbnail data (commonly JPEG; can be PNG/BMP depending on Windows version).

## Index file

References cache entries by offset. Entry size is format-dependent (~40–72 bytes): a hash value plus an array of cache-entry offsets, one per size variant — i.e. one logical thumbnail can point into several `thumbcache_<size>.db` files.

## If we ever add support

- Separate code path from the OLE2 parser — detect by the `CMMM` magic at offset 0 (vs OLE2's `D0 CF 11 E0 …`).
- No filenames: label entries by ThumbnailCacheId. Optional: correlate with the index file to group size variants of the same image.
- Reuse the existing payload handling once bytes are sliced (SOI scan still applies to JPEG payloads).
- Validate against real files per version (20/21/30/31/32) the same way the OLE2 variants were validated in `docs/local/project-definition.md` — do not trust a single sample.
