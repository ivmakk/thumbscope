// Pure column-sizing kernel for the browse table (`BrowseTable`). No DOM/React, so it is
// unit-tested under `node --test`. The component reads `gridTemplate()` for its
// `grid-template-columns`, `resizeWidth()` while dragging a border, and `autoFitWidth()`
// on a double-click auto-fit.

export type ColKey = 'index' | 'name' | 'size' | 'date' | 'dims'

// Column order, left to right. A trailing `1fr` spacer track (not a column) always follows.
export const COLUMN_ORDER: ColKey[] = ['index', 'name', 'size', 'date', 'dims']

// Default track when a column has no manual/auto-fit override. Name flexes up to a cap so it
// absorbs slack on small/mid windows but stops drifting on wide ones (the spacer takes the rest).
const DEFAULT_TRACK: Record<ColKey, string> = {
  index: '4rem',
  name: 'minmax(12rem, 36rem)',
  size: '6rem',
  date: '12rem',
  dims: '6rem'
}

const SPACER_TRACK = '1fr'

// Per-column minimum track width in px (rem @ 16). Header and body inner share this as `min-width`
// so the grid fills the container when wide (spacer eats slack) but overflows *together* - aligned
// horizontal scroll - when narrow. Needed because the virtualized rows are position:absolute and so
// don't contribute intrinsic width for a `min-content` sizing to key off.
const DEFAULT_MIN_PX: Record<ColKey, number> = { index: 64, name: 192, size: 96, date: 192, dims: 96 }

export function minTemplateWidth(overrides: WidthOverrides = {}): number {
  return COLUMN_ORDER.reduce((sum, k) => sum + (overrides[k] ?? DEFAULT_MIN_PX[k]), 0)
}

// A manual drag or auto-fit pins a column to a fixed px width; absent keys keep their default track.
export type WidthOverrides = Partial<Record<ColKey, number>>

export function gridTemplate(overrides: WidthOverrides = {}): string {
  const tracks = COLUMN_ORDER.map((k) => {
    const px = overrides[k]
    return px != null ? `${px}px` : DEFAULT_TRACK[k]
  })
  return [...tracks, SPACER_TRACK].join(' ')
}

// Min column width so a border drag can't collapse a column to nothing (~3rem).
export const MIN_COL_PX = 48

export function resizeWidth(startPx: number, deltaPx: number, floorPx: number = MIN_COL_PX): number {
  return Math.max(floorPx, Math.round(startPx + deltaPx))
}

// Absolute ceiling so one pathological value can't blow a column past sanity. Not panel-relative
// (that would punish small windows where the user is fine with horizontal scroll).
export const AUTOFIT_BACKSTOP_PX = 1200

export function autoFitWidth(
  maxContentPx: number,
  opts: { paddingPx: number; extraPx?: number; backstopPx?: number }
): number {
  const { paddingPx, extraPx = 0, backstopPx = AUTOFIT_BACKSTOP_PX } = opts
  return Math.min(backstopPx, Math.ceil(maxContentPx + paddingPx + extraPx))
}
