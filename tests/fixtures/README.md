# Test fixtures

## Synthetic (committed)

Deterministic, privacy-safe fixtures generated in code are the primary test inputs. The generator (`fixture.js`, ported from `spikes/poc/test/fixture.js` in phase 2) builds valid CFB Thumbs.db buffers in memory - no binary files committed. Use these for all unit tests.

## Real samples (local only, NOT committed)

`tests/fixtures/real/` holds real-world sample DBs for manual and integration checks. It is **gitignored** because the files contain personal photos (recovered/multi-source data). Do not commit them. Each contributor populates this folder locally.

Thumbs.db is the primary focus and spans several internal formats; the corpus covers each:

| File | Variant | Notes |
| --- | --- | --- |
| `classic_thumbs_295.db` | A: classic JPEG, real names (16-byte catalog) | 295 thumbnails, names like `IMG041.JPG` |
| `classic_thumbs_184.db` | A: classic JPEG, real names | 184 thumbnails, Cyrillic names |
| `classic_realnames_more2010.db` | A: classic JPEG, real names | 173 thumbnails, names like `546854.jpg` |
| `classic_phone_nokia.db` | A: classic JPEG, real names | 30 thumbnails, phone camera names |
| `classic_guid_names.db` | B: classic JPEG, GUID "names" | 109 thumbnails; catalog names are GUIDs, not filenames |
| `vista_256_dib.db` | C: Vista/7 modern (`256_<hash>` streams, DIB, no Catalog) | hash names only, raw DIB payloads, no filenames recoverable |
| `thumbs_empty_zeros.db` | edge: not CFB (16 KB of zeros) | empty/corrupt stub; must not crash |
| `appledouble_stub.db` | edge: not CFB | macOS `._` stub; rejected by magic check |

Secondary (ehthumbs.db family):

| File | Variant | Notes |
| --- | --- | --- |
| `ehthumbs_small.db` | ehthumbs DIB (8-byte catalog) | small |
| `ehthumbs_mid.db` | ehthumbs DIB | mid-size |
| `ehthumbs_empty.db` | ehthumbs | empty catalog, 0 thumbnails (edge case) |

IrfanView (ivThumbs.db family):

| File | Variant | Notes |
| --- | --- | --- |
| `irfanview_ivthumbs.db` | IrfanView flat (`_Thumbs_DB_Ver`, filename streams, BMP payloads, no Catalog) | 109 thumbnails; real filenames + FILETIME dates; payload = 16-byte prefix + complete BMP. |
| `irfanview_ivthumbs_nested.db` | IrfanView nested (filenames are CFB storages with no start sector) | 42 thumbnails; carved from the raw `[prefix + BMP]` grid; filenames paired best-effort by directory order, dates from per-block FILETIME. |

Scan them with: `node spikes/poc/scan.js <utf8-list-of-paths.txt>`.

Tests that consume `tests/fixtures/real/` must **skip gracefully when the folder is absent** (e.g. on CI), so the suite still passes with only the synthetic fixtures.
