// Pure, Electron-free export helpers: size math, filename disambiguation, CSV.
// The main process (sharp + fs) drives these; CLI mode (phase 9) reuses them.

export type SizeMode = 'original' | 'upscale800'

// Target pixel size for a thumbnail under the chosen mode.
// null = leave at stored size (no resize). Upscale never downscales; longer side -> exactly 800.
export function targetDimensions(
  width: number,
  height: number,
  mode: SizeMode
): { width: number; height: number } | null {
  if (mode === 'original') return null
  const longer = Math.max(width, height)
  if (longer >= 800) return null
  if (width >= height) return { width: 800, height: Math.round((height * 800) / width) }
  return { width: Math.round((width * 800) / height), height: 800 }
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

// Strip characters illegal in Windows filenames plus trailing dots/spaces.
function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
}

export interface NameSource {
  name: string | null
  index: number | null
  streamName: string
}

// Resolve a unique `.jpg` filename. catalog name -> item id -> stream name; collisions get a numeric suffix.
// `taken` holds lowercased names already used (Windows is case-insensitive); mutated in place.
export function exportFilename(e: NameSource, taken: Set<string>): string {
  let base: string
  if (e.name) base = stripExt(e.name)
  else if (e.index != null) base = `thumb_${e.index}`
  else base = `thumb_${e.streamName}`
  base = sanitize(base) || 'thumb'

  let candidate = `${base}.jpg`
  let n = 1
  while (taken.has(candidate.toLowerCase())) candidate = `${base}_${n++}.jpg`
  taken.add(candidate.toLowerCase())
  return candidate
}

export interface CsvRow {
  id: number | string | null
  filename: string
  size: number
  date: string | null
  width: number | null
  height: number | null
}

function csvField(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: CsvRow[]): string {
  const head = ['id', 'filename', 'size', 'date', 'width', 'height']
  const lines = [head.join(',')]
  for (const r of rows) {
    lines.push([r.id, r.filename, r.size, r.date, r.width, r.height].map(csvField).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
