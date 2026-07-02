// Resolve the browse table's `#` column. Catalog variants carry a real item-ID; index-less
// variants (hashed / carved / thumbcache) get a stable 1-based stamp of their position in the
// parser's entry order. Note that order is the container handler's canonical order, not necessarily
// on-disk order (e.g. the cfb handler sorts index-less streams by name), so the stamp is a stable
// positional identity, not a physical offset. Feed this the entries before any filter/sort so the
// stamp is assigned once and then travels with the row when sorted. Pure, no DOM/React ->
// unit-tested under `node --test`. Renderer-side only (see task doc for the CLI-parity note).

export function resolveDisplayIndex<T extends { index: number | null }>(entries: T[]): T[] {
  return entries.map((e, i) => (e.index == null ? { ...e, index: i + 1 } : e))
}
