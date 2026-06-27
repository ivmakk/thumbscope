// Grid thumbnail size bounds + the validation kernel for the persisted value. Pure, no DOM:
// the localStorage read stays at the call site (App.initThumbSize) and hands the raw string here.

export const DEFAULT_THUMB = 150
export const THUMB_MIN = 90
export const THUMB_MAX = 300

export function parseThumbSize(raw: string | null): number {
  const v = Number(raw)
  return Number.isFinite(v) && v >= THUMB_MIN && v <= THUMB_MAX ? v : DEFAULT_THUMB
}
