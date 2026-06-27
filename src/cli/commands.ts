// CLI command logic, kept separate from the commander wiring so it is unit-testable.
// Each command returns a process exit code; never throws on bad/corrupt input.

import { dirname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { openThumbnailDb } from '../core/formats/open.ts'
import { resolveDbPath } from '../core/shell.ts'
import { exportEntries } from '../core/encode.ts'
import { toCsv, type SizeMode, type CsvRow } from '../core/export.ts'
import { sortEntries } from '../core/view.ts'
import type { ThumbEntry } from '../core/types.ts'

export interface ExportArgs {
  out?: string
  mode: string // 'original' | '800'
  quality: string // numeric string from commander
  filter?: string
  csv: boolean
  overwrite: boolean
  format?: string // force a container handler by slug (manual override)
}

export interface ListArgs {
  csv?: string // output file path; omit = print to stdout
  format?: string // force a container handler by slug (manual override)
}

// Read a db path (file or folder) and parse it. Returns entries or an error message.
// `format` forces a container handler by slug (manual override), passed straight to openThumbnailDb.
async function load(
  db: string,
  format?: string
): Promise<{ path: string; entries: ThumbEntry[] } | { error: string }> {
  const resolved = await resolveDbPath(db)
  if ('error' in resolved) return resolved
  try {
    // openThumbnailDb handles container detection (SQLite header-routed by path; OLE2 read + sync core).
    const parsed = await openThumbnailDb(resolved.path, format ? { format } : undefined)
    return { path: resolved.path, entries: sortByIndex(parsed.entries) }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

// Match the UI's default order (index ascending). sortEntries lives in core/view.ts and
// wants ViewEntry (date as ISO string); wrap each entry so we can reorder the originals.
function sortByIndex(entries: ThumbEntry[]): ThumbEntry[] {
  const view = entries.map((e) => ({
    streamName: e.streamName,
    label: e.label,
    name: e.name,
    size: e.size,
    index: e.index,
    date: e.date ? e.date.toISOString() : null,
    entry: e
  }))
  return sortEntries(view, 'index', 'asc').map((v) => v.entry)
}

function applyFilter(entries: ThumbEntry[], filter?: string): ThumbEntry[] {
  if (!filter) return entries
  const f = filter.toLowerCase()
  return entries.filter((e) => (e.name ?? e.label).toLowerCase().includes(f))
}

export async function cmdExport(db: string, args: ExportArgs): Promise<number> {
  if (args.mode !== 'original' && args.mode !== '800') {
    process.stderr.write(`Invalid --mode "${args.mode}" (expected original|800)\n`)
    return 2
  }
  const quality = Number(args.quality)
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    process.stderr.write(`Invalid --quality "${args.quality}" (expected 1-100)\n`)
    return 2
  }

  const loaded = await load(db, args.format)
  if ('error' in loaded) {
    process.stderr.write(loaded.error + '\n')
    return 1
  }

  const entries = applyFilter(loaded.entries, args.filter)
  if (entries.length === 0) {
    process.stderr.write(args.filter ? `No thumbnails match "${args.filter}"\n` : 'No thumbnails to export\n')
    return 1
  }

  const outDir = args.out ?? dirname(loaded.path)
  try {
    await mkdir(outDir, { recursive: true })
  } catch (err) {
    process.stderr.write(`Could not create output folder: ${(err as Error).message}\n`)
    return 1
  }

  const mode: SizeMode = args.mode === '800' ? 'upscale800' : 'original'
  const summary = await exportEntries(entries, {
    outDir,
    mode,
    quality,
    skipExisting: !args.overwrite,
    includeCsv: args.csv
  })

  process.stderr.write(
    `${summary.ok} exported / ${summary.failed} failed / ${summary.skipped} skipped -> ${summary.outDir}\n`
  )
  return summary.failed > 0 && summary.ok === 0 ? 1 : 0
}

export async function cmdList(db: string, args: ListArgs): Promise<number> {
  const loaded = await load(db, args.format)
  if ('error' in loaded) {
    process.stderr.write(loaded.error + '\n')
    return 1
  }

  const rows: CsvRow[] = loaded.entries.map((e) => ({
    id: e.index ?? e.streamName,
    filename: e.name ?? e.label,
    size: e.size,
    date: e.date ? e.date.toISOString() : null,
    width: e.width,
    height: e.height
  }))

  if (args.csv) {
    try {
      await writeFile(args.csv, toCsv(rows))
    } catch (err) {
      process.stderr.write(`Could not write CSV: ${(err as Error).message}\n`)
      return 1
    }
    process.stderr.write(`Wrote ${rows.length} rows -> ${args.csv}\n`)
    return 0
  }

  // Aligned table: header + one row per thumbnail, columns padded to their widest value.
  // Column order mirrors the UI table (#, Name, Size, Date, Dims).
  const header = ['#', 'NAME', 'SIZE', 'DATE', 'DIMS']
  // "2010-07-02T14:03:20.000Z" -> "2010-07-02 14:03:20" (drop T / Z / milliseconds).
  const fmtDate = (iso: string | null): string => (iso ? iso.slice(0, 19).replace('T', ' ') : '-')
  const table = rows.map((r) => [
    String(r.id),
    r.filename,
    String(r.size),
    fmtDate(r.date),
    r.width && r.height ? `${r.width}x${r.height}` : '-'
  ])
  const widths = header.map((h) => h.length)
  for (const row of table) {
    row.forEach((c, i) => {
      if (c.length > widths[i]) widths[i] = c.length
    })
  }
  // Don't pad the last column (avoids trailing whitespace).
  const fmt = (row: string[]): string =>
    row.map((c, i) => (i === row.length - 1 ? c : c.padEnd(widths[i]))).join('  ')

  process.stdout.write(fmt(header) + '\n')
  for (const row of table) process.stdout.write(fmt(row) + '\n')
  process.stderr.write(`\n${rows.length} thumbnails\n`)
  return 0
}
