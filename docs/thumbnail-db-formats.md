# Thumbnail database formats - reference

Format specs for everything Thumbscope reads, plus reference notes on a format it doesn't read yet. `CLAUDE.md` carries the variant taxonomy and the standing parser rules; **read this doc before editing `formats/open.ts`, the container handlers, or `formats/codec/abbrevJpeg.ts`.** Split into per-format docs later if it grows too large.

## Formats

| # | Slug | File | Format | Status |
|---|---|---|---|---|
| 1.2 | `catalog-jpeg` | `Thumbs.db` | [Classic JPEG (Win2000/XP)](#12-classic-jpeg-win2000xp--catalog-jpeg) | ✅ supported |
| 1.3 | `catalog-jpeg-guid` | `Thumbs.db` | [Classic JPEG, GUID names](#13-classic-jpeg-guid-names--catalog-jpeg-guid) | ✅ supported |
| 1.4 | `hashed-jpeg` | `Thumbs.db` (Vista/7) | [Modern JPEG (Vista/7)](#14-modern-jpeg-vista7--hashed-jpeg) | ✅ supported |
| 1.5 | `abbrev-jpeg` | `Thumbs.db` (XP) | [XP abbreviated JPEG](#15-xp-abbreviated-jpeg--abbrev-jpeg) | ✅ supported |
| 1.6 | `catalog-dib` | `ehthumbs.db` | [ehthumbs media (DIB)](#16-ehthumbs-media-dib--catalog-dib) | ✅ supported |
| 1.7 | `irfanview-flat` / `irfanview-nested` | `ivThumbs.db` | [IrfanView](#17-irfanview--irfanview-flat--irfanview-nested) | ✅ supported |
| 1.9 | `recovered` | any (corrupt container) | [Recovered (carved)](#19-recovered-carved--recovered) | ✅ fallback |
| 1.10 | `hashed-png` | `Thumbs.db` | [Hashed PNG](#110-hashed-png--hashed-png) | ✅ supported |
| 2 | `thumbcache-cmmm` | `thumbcache_*.db` | [thumbcache (CMMM)](#2-thumbcache_db-cmmm--supported) | ✅ supported |
| 3 | `sqlite-photothumb` | `photothumb.db` | [PhotoScape SQLite cache](#3-sqlite-backed-caches-supported) | ✅ supported |

Supporting sections: [1.1 Container basics](#11-container-basics), [1.8 DIB payload layout](#18-dib-payload-layout).

---

# 1. OLE2 `Thumbs.db` family (supported)

Deep forensic detail for the OLE2 `Thumbs.db` / `ehthumbs.db` / `ivThumbs.db` family that `src/core/formats/` parses (orchestrator `open.ts` + the `container/` handlers).

## 1.1. Container basics

Classic `Thumbs.db` is an **OLE2 / Compound File Binary** container (magic `D0 CF 11 E0 A1 B1 1A E1`), read with `cfb`. Inside:

- A **`Catalog`** stream: header + one entry per thumbnail with an item ID, a **FILETIME** timestamp, and the original filename as **UTF-16LE**. Only source of real filenames.
- **Numbered streams** holding each thumbnail's bytes. Stream names are the item-ID **digits reversed** (index 12 → stream `"21"`). Only digit-named streams are thumbnails; ignore others (e.g. the SheetJS watermark stream the `cfb` writer injects).

Thumbnail payloads are a plain JPEG or a JPEG behind a small Microsoft "thumbstream" header. Extract robustly by scanning for the SOI marker `FF D8 FF` and slicing from there (do **not** parse the MS header).

The (gitignored) corpus in `tests/fixtures/real/` has a real sample of each variant below.

> **Naming.** None of these variant names are official - Microsoft never documented the `Thumbs.db` internals. The **slug** (e.g. `catalog-jpeg`) is the project's canonical key; it supersedes the former ambiguous `A`/`B`/`C`/`Type 1` labels. Code identifiers for the `abbrev-jpeg` variant use the `Abbrev` stem (`formats/codec/abbrevJpeg.ts`, `decodeAbbrevRgb`, `reconstructAbbrevJpeg`, `isAbbrevJpeg`).

## 1.2. Classic JPEG (Win2000/XP) - `catalog-jpeg`

16-byte catalog header, JPEG payloads, UTF-16LE names. The core case.

## 1.3. Classic JPEG, GUID names - `catalog-jpeg-guid`

Same as `catalog-jpeg`, but catalog "names" are GUIDs (`{…}`) - fall back to item ID for export naming.

## 1.4. Modern JPEG (Vista/7) - `hashed-jpeg`

Stream names `<size>_<hash>` (e.g. `256_…`), **no Catalog**, no filenames - use the hash as label. Real sample payload is **JPEG behind a 24-byte MS prefix** (`headerSize=24`, `width=0`, SOI at offset 24); the SOI scan strips it. Confirmed 194/194.

## 1.5. XP abbreviated JPEG - `abbrev-jpeg`

Classic catalog/stream layout (real filenames, digit-reversed names), but each payload is an **abbreviated JPEG** - `SOI + SOF0 + scan`, with **no DQT and no DHT** (Windows supplied them implicitly). The SOF tags **4 components `R,G,B,A` (`52 47 42 41`)**; despite the "CMYK" lore, the samples are plain 8-bit RGB stored in **reversed channel order** with an unused 4th plane, bottom-up. A browser (or a plain JPEG decode) can't render a tableless 4-component frame, so names showed without images.

`isAbbrevJpeg` detects the exact RGBA component signature; `reconstructAbbrevJpeg` (sync, cheap - runs at parse) splices the standard blocks Windows omits around the stream's SOF+scan: `SOI+APP0 | two DQT tables (luma id 0 + chroma id 1) | SOF | DC+AC Huffman | scan`. **No Adobe APP14** - our own decoder reads the four components directly. The result is stored as a `abbrev-jpeg` payload (the reconstructed JPEG bytes; the kind name is a historical misnomer).

A self-contained baseline decoder, `decodeAbbrevRgb` in `src/core/jpegAbbrev.ts` (pure, no sharp/DOM), does the actual decode lazily: it reads the raw component samples and maps **`R = c2, G = c1, B = c0`** (reversed order, **no complement**), **ignoring the 4th plane**, flipping vertically (bottom-up storage) - returning upright packed RGB. `renderAbbrevJpeg` (display, via get-image) and the `encodeJpeg` abbrev-jpeg branch (export) both call it, then hand the RGB to sharp (PNG / JPEG; **no `.flip()`** - the decoder already flipped). Decoding only what's viewed keeps parse fast and memory low on big files; subsampled / non-baseline frames throw and the entry falls back to listing-only; reconstruction failure falls back to raw JPEG bytes (entry still lists).

The transform was reverse-engineered from the reference tool **thumbsviewer** (BSD-3-Clause; standard Annex-K tables aren't copyrightable), which reads these via Windows GDI+ `LockBits(32bppCMYK)` then takes `255-C/M/Y` - GDI+ pre-inverts the raw samples, so the two inversions cancel to this plain reversed copy. **Validated ±1 per channel against GDI+ on real XP samples** (from the gitignored corpus); the earlier `255-c` complement was wrong (inverted day↔dusk, green↔magenta) and sharp's generic CMYK→RGB is worse still (applies the 4th plane → near-black). Routed inside `classify` (DIB → PNG → abbrev-jpeg → JPEG passthrough).

## 1.6. ehthumbs media (DIB) - `catalog-dib`

Like classic (`catalog-jpeg`) but the file is `ehthumbs.db`, the catalog header is **8 bytes**, and payloads are raw **24bpp DIB**. The one variant that needs DIB decoding.

## 1.7. IrfanView - `irfanview-flat` / `irfanview-nested`

Also an OLE2 container, marked by a `_Thumbs_DB_Ver` stream and **no Catalog**.

**Flat sub-variant** (`parseIrfanView`): each thumbnail is a stream **named with the original filename directly** (real names, no reversal); payload is a **16-byte prefix (8-byte FILETIME + two u32 flags) followed by a complete BMP file** (`BM`…, BITMAPINFOHEADER, 24/32bpp). The parser strips the 16-byte prefix and decodes the BMP to the same packed-RGB `dib` payload used by ehthumbs, so display/export are uniform; the FILETIME gives real dates. Confirmed 109/109 on a real flat sample.

**Nested sub-variant** (`parseIrfanViewNested`): stores each filename as a CFB *storage* whose directory entry has the stream size but **no start sector** (objType 0, start = ENDOFCHAIN), so the standard reader can't reach the bytes - but the `[prefix + BMP]` blocks still sit in the file as a regular grid, so it carves them directly (a `BM`+BITMAPINFOHEADER preceded by a prefix whose two trailing u32 flags are both 1; a spurious leading/overlapping hit is dropped). Filenames come from the directory in order and are paired to carved blocks **only when the counts match exactly** (best-effort - without start sectors the mapping isn't guaranteed); otherwise positional `#n` labels. Per-block FILETIME still gives dates. Confirmed 42/42 on a real nested sample.

Both detected by the version stream and routed before the classic path: flat first, then nested.

## 1.8. DIB payload layout

DIB payload (24-byte header): `u32 headerSize@0`, **signed `i32 stride@8`** (negative = bottom-up, abs = bytes/row), `u32 width@12`, `height@16`, `imageSize@20`; channels = `abs(stride) >= width*4 ? 4 : 3` (24bpp BGR or 32bpp BGRA). The parser normalizes to top-down packed RGB; `image.ts` wraps to BMP for display, sharp ingests RGB on export. Confirmed visually on both real ehthumbs samples (small = 24bpp bottom-up, mid = 32bpp top-down).

## 1.9. Recovered (carved) - `recovered`

When the container is unreadable (truncated / half-downloaded / partly corrupt) *and* raw image bytes survive, the parser carves `FF D8 FF`…`FF D9` JPEG runs from the whole buffer and returns them with `recovered: true` (positional `#n` labels, no catalog metadata - filenames/dates/DIBs are lost with the container). If no JPEG runs survive it falls back to carving PNG runs (signature+IHDR … end of `IEND`), so a damaged `hashed-png` file still recovers, and finally to complete BMP files (`carveBmps`, for orphaned thumbcache payloads). Carving runs only as a fallback (container throws, or normal parse finds zero thumbs), never on healthy files; the renderer shows an amber recovery banner.

**Known limitation - tiers are mutually exclusive.** The JPEG → PNG → BMP chain keeps only the *first* tier that matches: an orphaned buffer holding a **mix** of codecs recovers only the highest-priority one present and silently drops the rest (e.g. a corrupt thumbcache 256 bucket with both JPEG and PNG in free space carves only the JPEGs). Acceptable for the current recovery cases; a carve-every-codec pass is a deferred follow-up.

Do not assume other variant filenames (`Image.db`, etc.) share any layout; verify per format. Full validation evidence in `docs/local/project-definition.md`.

## 1.10. Hashed PNG - `hashed-png`

Same container shape as `hashed-jpeg` (OLE2, **no Catalog**, stream names `<size>_<hash>` - use the hash as label), but the payload is **PNG, not JPEG**. Each stream is a **24-byte MS prefix** (`headerSize=24` at offset 0; a payload-type field at offset 4 = `3` for PNG; data size = stream length - 24 at offset 8; an 8-byte checksum) followed by a complete PNG (signature `89 50 4E 47 0D 0A 1A 0A` at offset 24, IHDR dims at sig+16 width / sig+20 height big-endian, `IEND` tail).

`slicePng` finds the PNG signature (stepping over the prefix, like the SOI scan) and slices to the buffer end; `pngDimensions` reads the IHDR. PNG is natively displayable and sharp-ingestable, so the payload is a **passthrough** `png` kind (like `jpeg`, unlike `abbrev-jpeg`/`dib`): `payloadToImage` returns `image/png` as-is, export re-encodes to JPEG via sharp. Routing is by **signature** (the type field is corroboration only); `classify` checks PNG **before** JPEG because a PNG's compressed body can incidentally contain `FF D8 FF` that the JPEG scan would mis-slice. Validated on one real sample (3 thumbnails) cross-checked against thumbsviewer; widen if more samples surface. Committed SFW sample: `sample/Thumbs-png.db` (generator `--png` mode).

---

# 2. `thumbcache_*.db` (CMMM) - supported

> **Scope note:** A *different* format from the OLE2 family above. `thumbcache_*.db` is the per-user Windows Explorer thumbnail cache and is **not OLE2** - a flat `CMMM` container. Parsed by `src/core/formats/container/thumbcache.ts`, routed at the async/header tier in `open.ts` (by `CMMM` magic, alongside SQLite), **not** through the CFB registry. Slug `thumbcache-cmmm`.

Source: libyal/libwtcdb - [Windows Explorer Thumbnail Cache database format](https://github.com/libyal/libwtcdb/blob/main/documentation/Windows%20Explorer%20Thumbnail%20Cache%20database%20format.asciidoc). Field offsets below were verified against real files across format versions 20/21/31/32 plus the fox-it `dissect.thumbcache` cstructs (understanding only - reimplemented clean).

## 2.1. What it is

Introduced on Windows Vista, replacing per-folder `Thumbs.db` for Explorer's own cache. Lives in `%LocalAppData%\Microsoft\Windows\Explorer\` as a set of files:

- **Cache files** - `thumbcache_<size>.db` (e.g. `thumbcache_256.db`): hold the actual thumbnail bytes plus file references.
- **Index files** - `thumbcache_idx.db`: lookups/metadata mapping a thumbnail ID to entry offsets across the size-specific cache files.

Thumbnails are identified by a **ThumbnailCacheId** - a 64-bit value, stored as a hex string without leading zeros. There is no original filename in the cache itself (resolving it requires the Windows Search / property store, out of scope here).

## 2.2. Where it fits - `Thumbs.db` to `thumbcache_*.db`

`thumbcache_*.db` is the **Vista-onward replacement** for the per-folder `Thumbs.db`. Two things changed across Windows versions - *where* thumbnails live and the *format* they live in:

**Location.** Windows 2000/ME/XP wrote a hidden per-folder `Thumbs.db` (plus `ehthumbs.db` for media) into every folder browsed. Vista moved the cache **out of the photo folders into one per-user store** (`%LocalAppData%\Microsoft\Windows\Explorer\`), fixing the privacy/clutter problem of `Thumbs.db` leaking filenames and thumbnails into shared folders. `Thumbs.db` is **not fully retired**, though: Vista+ still writes it to **network / remote / removable** locations (local NTFS uses the central cache), which is why modern `Thumbs.db` samples still appear - and they use a newer internal layout (`hashed-jpeg` above). The behavior is controllable via the GPO "Turn off the caching of thumbnails in hidden thumbs.db files."

**Two distinct lineages.** Don't conflate them:
- The `Thumbs.db` container itself evolved: XP "classic" OLE2 with a `Catalog` stream + digit-reversed numbered streams and real UTF-16 filenames → Vista/7 "modern" OLE2 with **no Catalog** and streams named `<size>_<hash>` (DIB/JPEG payloads). **Both are OLE2 and both are already handled by the cfb container handler (`src/core/formats/container/cfb.ts`)** (`catalog-jpeg`/`catalog-jpeg-guid` and `hashed-jpeg`).
- `thumbcache_*.db` (this section) is a **separate, non-OLE2 format** - a flat `CMMM` cache stream. It is **not** handled today and needs its own code path.

## 2.3. Signatures

- Cache file / cache entry: `CMMM` at offset 0.
- Index file: `IMMM` (at offset 4 in format 30+, offset 0 in formats 20–21).
- Format versions are version-dependent (entry/index layouts differ); the cache also gained more size buckets over time:

| Format ver | Windows | Size buckets - files `thumbcache_<bucket>.db` |
|---:|---|---|
| 20 | Vista | 32, 96, 256, 1024, sr |
| 21 | 7 | 32, 96, 256, 1024, sr |
| 30 | 8.0 | 16, 32, 48, 96, 256, 1024, sr, wide, exif |
| 31 | 8.1 | 16, 32, 48, 96, 256, 1024, 1600, sr, wide, exif, wide_alternate |
| 32 | 10 / 11 | 16, 32, 48, 96, 256, 768, 1280, 1920, 2560, sr, wide, exif, wide_alternate, custom_stream |

`iconcache_*.db` (icons) shares the same `CMMM` container. Validate against a real file **per version** - do not trust a single sample.

## 2.4. Cache file header (24 bytes) - field order shifts at version 30

The `firstEntry` / `firstAvail` offsets move by one u32 at format version 30 (an empty field is inserted at 0x0C). **Verified on real v20/v21 vs v31/v32 files** - clamping to one layout silently yields 0 entries on the other.

| Offset | v20 / v21 | v30+ |
|-------:|-----------|------|
| 0  | signature `CMMM` | signature `CMMM` |
| 4  | format version | format version |
| 8  | cache type | cache type |
| 12 | first cache entry | (empty) |
| 16 | first available (free) entry | first cache entry |
| 20 | entry count | first available (free) entry |

`firstAvail` is the **used** size (buckets are pre-allocated, so file length >= firstAvail, often 1 MB of zero padding). The walk runs from `firstEntry` up to `firstAvail`; the natural stop is the zero-filled free space.

## 2.5. Cache entry (variable length) - per-version fixed header

Each entry begins with its own `CMMM` signature + u32 entry size, then an 8-byte hash (ThumbnailCacheId), then `idStrSize` / `paddingSize` / `dataSize`, checksums, the UTF-16 identifier string, padding, and finally the payload. The **fixed** header (bytes before the id string) and the size-field offsets differ by version - all three verified against real samples + the dissect cstructs:

| Version | Fixed | idStrSize @ | paddingSize @ | dataSize @ | Why |
|---|---:|---:|---:|---:|---|
| 21 (Win7) | 48 | 16 | 20 | 24 | baseline |
| 20 (Vista) | 56 | 24 | 28 | 32 | extra 8-byte `Extension[4]` wchar after the hash shifts the size fields by 8 |
| 30+ (Win8+) | 56 | 16 | 20 | 24 | no Extension (size fields at Win7 offsets) but 8 unknown bytes sit before the id string |

Payload location = `entryStart + fixed + idStrSize + paddingSize` (never a hardcoded offset - `idStrSize` varies).

**`dataSize == 0` is a placeholder** (a path / shell-item entry with an id string but no cached image, e.g. Recycle Bin / CLSID). Walkable and skipped, **not** counted as failed. A cache can be entirely placeholders (real: `v31/dissect_256.db` = 11 entries, all dataSize 0 -> 0 thumbnails, correct).

## 2.5.1. Payload codec - route by magic, not by bucket

The codec is picked from the **payload's own magic** (`classifyThumbcache`), not the bucket size, because a bucket can mix codecs (real: a 256 bucket holds both JPEG and PNG):

- `BM` -> 32bpp BITMAPV5HEADER with **premultiplied** BGRA (small buckets 16/32/48/96). Decoded by `parseBmpRgba`: BITFIELDS-guarded, alpha un-premultiplied to straight RGBA, a uniform-zero alpha plane treated as opaque. New payload kind **`rgba`**, rendered to PNG via sharp so the browser shows transparency; the grid/preview draw a checkerboard behind it. **Known limitation:** the checkerboard is keyed on the `rgba` kind, not on actual alpha - a transparent **PNG** payload keeps kind `png` and renders without a checkerboard. Cosmetic; a payload-level `hasAlpha` flag is the deferred fix.
- PNG signature -> `png` passthrough.
- JPEG SOI -> `jpeg` passthrough (large buckets 256/768/1280/exif).

Not the shared `classify()` (which is ehthumbs-DIB-first and would misread a real `BM` file).

## 2.5.2. Orphaned-payload recovery (tier-2 carve)

When the entry walk yields **0** live payloads but complete images survive in the pre-allocated free space (past `firstAvail`), the orchestrator carves them the same as any zero-entry container: JPEG -> PNG -> **complete BMP files** (`carveBmps`, strict size validation, 32bpp->`rgba` / 24bpp->`dib`). Result is `recovered` with positional `#n` labels and the amber banner. Real: `v21/dissect_256.db` = 14 orphaned 24bpp BMPs carved to `dib`.

## 2.5.3. Index files (`IMMM`) are refused, not parsed

`thumbcache_idx.db` is an `IMMM` container - a hash->bucket lookup table with **no image payloads**. It is detected (`detectIndex`, checked after CMMM/SQLite) and refused with `ThumbcacheIndexError` so tier-2 carve can't invent broken thumbnails from stray byte runs inside the index. **On a real Win10/11 idx the `IMMM` signature sits at offset 4** (behind a 4-byte `0C 00 30 20` field), not offset 0 as some references show - the guard checks both.

## 2.6. Index file

References cache entries by offset. Entry size is format-dependent (~40–72 bytes): a hash value plus an array of cache-entry offsets, one per size variant - i.e. one logical thumbnail can point into several `thumbcache_<size>.db` files.

## 2.7. Validation

Walked the whole gitignored real corpus (`tests/fixtures/real/thumbcache/`, 20 files across v20/v21/v31/v32) via `openThumbnailDb`: **all open, 0 failed**. Codecs land as expected - small buckets `rgba`, large buckets `jpeg`, 256/768 mix `jpeg`+`png`; the two special cases (`v21` orphan carve, `v31` all-placeholder) behave as documented above.

**Gap: format version 30 (Win8.0) has no real sample.** It rides the `>= 30` code branch (shared with v31/v32), so the code path is exercised, but a true v30 file is unvalidated. `dissect.thumbcache`'s own enum omits 0x1E entirely; the `30 = Win8.0` mapping is inference, not byte-proven here. There are no version tags between 21 (0x15) and 30 (0x1E) in the wild - the version field is a format tag, not a dense counter.

Related perf follow-up (large caches paint slowly) is tracked separately as a format-agnostic render-pipeline issue, not part of this format's support.

---

# 3. SQLite-backed caches (supported)

A thumbnail cache that is **not OLE2 and not CMMM**: a plain **SQLite 3** database. Detected by the 16-byte magic `53 51 4C 69 74 65 20 66 6F 72 6D 61 74 20 33 00` (`SQLite format 3\0`) at offset 0. Read by `src/core/photothumb.ts` with Node's built-in `node:sqlite` (zero new dependencies), not `parser.ts`.

## 3.1. PhotoScape `photothumb.db` - `sqlite-photothumb`

A `photothumb.db` thumbnail cache. **Attribution: PhotoScape**, per multiple web sources (the file bytes carry no app name, so this is a corroborated attribution, not byte-proven). It is **not** ACDSee - ACDSee uses FoxPro `.dbf`/`.fpt` stores (`Thumb*.dbf`), a different format. A single table holds everything:

```sql
CREATE TABLE thumb(
  fname   text primary key,  -- original filename, e.g. DSC02196.JPG
  tcreate int,               -- cache-write time (Unix seconds)
  tmodify int,               -- original file mtime (Unix seconds)
  fsize   int,               -- original file size in bytes
  width   int,               -- ORIGINAL image dimensions (not the thumbnail's)
  height  int,
  image   blob               -- the thumbnail: a complete JFIF JPEG
)
```

Each `image` blob is a standard JFIF JPEG (`FF D8 FF E0 … JFIF`) and decodes directly. Mapping to `ThumbEntry`:

- `name` / `label` = `fname` (`name` is `null` and `label` a positional `#n` when `fname` is missing). `streamName` is a **synthesized unique key** for the renderer's per-stream `Map`: `fname` is the table's primary key, but SQLite permits NULL/duplicate values in a non-INTEGER PK, so an empty or repeated `fname` falls back to a positional `row-n` / `#n`-suffixed id rather than colliding.
- `payload` = `jpeg` passthrough. The blob is run through `sliceJpeg` for safety (trims any prefix/trailing junk, though the sampled blobs are clean JPEGs), then `decode` (`formats/codec/decode.ts`) returns `image/jpeg` as-is; export re-encodes via sharp.
- `width` / `height` = the **thumbnail's own** SOF dimensions (via `jpegDimensions`), matching every other variant - **not** the `width`/`height` columns, which describe the original photo (e.g. 3240x4320) at a different scale. The original-dimension and `fsize` columns are not surfaced today.
- `date` = `tmodify` (original file mtime, Unix seconds → `Date`), matching the catalog-date semantics of classic `Thumbs.db` (the original file's date, not the cache-write time in `tcreate`).

`index` is `null` (no catalog item IDs), `recovered` is `false`, `catalogCount` is `0`.

**Layering.** `DatabaseSync` opens a file *path*, not a buffer, and `node:sqlite` is Node-only (like `cfb` / `sharp`). So `parsePhotothumb` takes the path, and `isSqliteFile(path)` routes at the call site - `src/main/index.ts` `openPath` and `src/cli/commands.ts` `load` both call `await isSqliteFile(path)` (which reads only the 16-byte header) and run `parsePhotothumb(path)` on a match, else read the full buffer and run `parseThumbsDb(buf)`. Reading just the header keeps the OLE2 path from loading a whole SQLite cache into memory only to discard it. The renderer never imports it, same as `parser.ts`. A SQLite file whose schema isn't this shape (no `thumb` table, or missing columns) throws a clear error shown as an open failure - it is **not** routed to the carve-recovery fallback (carving a SQLite b-tree yields nothing useful).

Validated on one real sample (47 thumbnails) via the CLI and export. Tests build a throwaway SQLite db at runtime (`src/core/photothumb.test.ts`) rather than committing a binary fixture; no real sample is committed (real samples stay gitignored in `tests/fixtures/real/`). Other SQLite thumbnail caches (different apps/schemas) are not assumed to match - verify per format before widening `parsePhotothumb`.
