// Pure, DOM-free browse logic (sort / filter / selection). Lives in core so it is unit-testable with
// `node --test` and reusable by the CLI `list` command. Operates on a minimal structural shape.

export type SortKey = 'index' | 'name' | 'size' | 'date'
export type SortDir = 'asc' | 'desc'

export interface ViewEntry {
  streamName: string
  label: string
  name: string | null
  size: number
  date: string | null // ISO string or null
  index: number | null
}

// Shared date-time formatter (renderer table + CLI list): "2010-07-02T14:03:20.000Z" ->
// "2010-07-02 14:03:20" (drop T / Z / milliseconds). `empty` is the placeholder for a null date -
// the table passes '' (blank cell), the CLI passes '-'. Pure, no DOM.
export function formatDateTime(iso: string | null, empty = ''): string {
  return iso ? iso.slice(0, 19).replace('T', ' ') : empty
}

export function filterEntries<T extends { label: string; name: string | null }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((e) => e.label.toLowerCase().includes(q) || (e.name?.toLowerCase().includes(q) ?? false))
}

export function sortEntries<T extends ViewEntry>(items: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  const cmp = (a: T, b: T): number => {
    switch (key) {
      case 'name':
        return a.label.localeCompare(b.label)
      case 'size':
        return a.size - b.size
      case 'date': {
        const da = a.date ? Date.parse(a.date) : -Infinity // nulls sort first asc / last desc
        const db = b.date ? Date.parse(b.date) : -Infinity
        return da - db
      }
      case 'index':
      default:
        return (a.index ?? 0) - (b.index ?? 0) || a.streamName.localeCompare(b.streamName)
    }
  }
  // stable: fall back to streamName to keep deterministic order on ties
  return [...items].sort((a, b) => cmp(a, b) * sign || a.streamName.localeCompare(b.streamName))
}

export interface SelectionInput {
  shift: boolean
  ctrl: boolean // ctrl OR meta (cmd)
}

export interface SelectionState {
  selected: Set<string>
  anchor: string | null
}

// Mouse-driven selection over an ordered id list (ids must be the currently displayed order).
// plain click -> single select; ctrl -> toggle; shift -> contiguous range from anchor.
export function updateSelection(
  state: SelectionState,
  orderedIds: string[],
  clickedId: string,
  input: SelectionInput
): SelectionState {
  if (input.shift && state.anchor && orderedIds.includes(state.anchor)) {
    const a = orderedIds.indexOf(state.anchor)
    const b = orderedIds.indexOf(clickedId)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return { selected: new Set(orderedIds.slice(lo, hi + 1)), anchor: state.anchor }
  }
  if (input.ctrl) {
    const selected = new Set(state.selected)
    if (selected.has(clickedId)) selected.delete(clickedId)
    else selected.add(clickedId)
    return { selected, anchor: clickedId }
  }
  return { selected: new Set([clickedId]), anchor: clickedId }
}

export function selectAll(orderedIds: string[]): SelectionState {
  return { selected: new Set(orderedIds), anchor: orderedIds[0] ?? null }
}

export function clearSelection(): SelectionState {
  return { selected: new Set(), anchor: null }
}
