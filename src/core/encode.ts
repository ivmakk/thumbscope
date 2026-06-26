// Electron-free export engine: payload -> JPEG (sharp) + the per-entry write loop.
// Shared by the GUI main process and the CLI so both produce byte-identical output.
// sharp is Node-only (not Electron-only) so it lives here; parser.ts/image.ts stay sharp-free.

import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import sharp from 'sharp'
import { targetDimensions, exportFilename, toCsv, type SizeMode, type CsvRow } from './export.ts'
import { decodeAbbrevRgb } from './jpegAbbrev.ts'
import type { Payload, ThumbEntry } from './types.ts'

// Encode one parsed payload to JPEG honoring the size mode.
// JPEG + original (or already >= target) = byte-identical passthrough; otherwise sharp re-encodes.
export async function encodeJpeg(
  payload: Payload,
  width: number | null,
  height: number | null,
  mode: SizeMode,
  quality: number
): Promise<Buffer> {
  if (payload.kind === 'jpeg') {
    const target = width && height ? targetDimensions(width, height, mode) : null
    if (!target) return payload.data
    return sharp(payload.data)
      .resize(target.width, target.height, { kernel: 'lanczos3' })
      .sharpen()
      .jpeg({ quality })
      .toBuffer()
  }
  if (payload.kind === 'png') {
    // Export always emits JPEG, so a PNG payload always re-encodes (no byte passthrough).
    const img = sharp(payload.data)
    const target = width && height ? targetDimensions(width, height, mode) : null
    if (target) img.resize(target.width, target.height, { kernel: 'lanczos3' }).sharpen()
    return img.jpeg({ quality }).toBuffer()
  }
  if (payload.kind === 'abbrev-jpeg') {
    // Reconstructed abbrev-jpeg JPEG: our decoder yields upright packed RGB (reversed-channel copy, no
    // complement, K ignored, already flipped), so sharp just ingests raw RGB — no CMYK profile, no flip.
    const rgb = decodeAbbrevRgb(payload.data)
    const img = sharp(rgb.pixels, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    const target = targetDimensions(rgb.width, rgb.height, mode)
    if (target) img.resize(target.width, target.height, { kernel: 'lanczos3' }).sharpen()
    return img.jpeg({ quality }).toBuffer()
  }
  const img = sharp(payload.pixels, {
    raw: { width: payload.width, height: payload.height, channels: 3 }
  })
  const target = targetDimensions(payload.width, payload.height, mode)
  if (target) img.resize(target.width, target.height, { kernel: 'lanczos3' }).sharpen()
  return img.jpeg({ quality }).toBuffer()
}

// Render a reconstructed abbrev-jpeg JPEG to a browser-displayable PNG. decodeAbbrevRgb returns upright
// packed RGB (reversed-channel copy, no complement, K ignored, already flipped); sharp just wraps it.
// Used by get-image.
export async function renderAbbrevJpeg(data: Buffer): Promise<Buffer> {
  const rgb = decodeAbbrevRgb(data)
  return sharp(rgb.pixels, { raw: { width: rgb.width, height: rgb.height, channels: 3 } }).png().toBuffer()
}

export interface ExportParams {
  outDir: string
  mode: SizeMode
  quality: number
  skipExisting: boolean // skip when a same-name file already exists in outDir (no clobber)
  includeCsv: boolean // also write thumbnails.csv beside the images
}

export interface ExportSummary {
  ok: number
  failed: number
  skipped: number
  outDir: string
}

// Export each entry to outDir as a unique .jpg. Per-entry errors are counted, never thrown.
// onProgress (optional) fires after every entry with running done/total.
export async function exportEntries(
  entries: ThumbEntry[],
  params: ExportParams,
  onProgress?: (done: number, total: number) => void
): Promise<ExportSummary> {
  const taken = new Set<string>()
  const rows: CsvRow[] = []
  let ok = 0
  let failed = 0
  let skipped = 0

  for (const entry of entries) {
    try {
      const filename = exportFilename(entry, taken)
      const dest = join(params.outDir, filename)
      if (params.skipExisting && existsSync(dest)) {
        skipped++
      } else {
        const jpeg = await encodeJpeg(entry.payload, entry.width, entry.height, params.mode, params.quality)
        await writeFile(dest, jpeg)
        rows.push({
          id: entry.index ?? entry.streamName,
          filename,
          size: jpeg.length,
          date: entry.date ? entry.date.toISOString() : null,
          width: entry.width,
          height: entry.height
        })
        ok++
      }
    } catch {
      failed++
    }
    onProgress?.(ok + failed + skipped, entries.length)
  }

  if (params.includeCsv && rows.length) {
    try {
      await writeFile(join(params.outDir, 'thumbnails.csv'), toCsv(rows))
    } catch {
      /* CSV is best-effort; image export already reported */
    }
  }

  return { ok, failed, skipped, outDir: params.outDir }
}
