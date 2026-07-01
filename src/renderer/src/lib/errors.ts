// Map main's raw error text to a short, end-user message. Pure, no DOM/React.

export function friendlyError(raw: string): string {
  if (/folder/i.test(raw)) return 'No Thumbs.db or ehthumbs.db found in that folder.'
  if (/could not (read|open)/i.test(raw)) return "Couldn't open that file."
  // A thumbcache *index* (thumbcache_idx.db) opens fine but holds no images - surface the actionable
  // "open a sibling bucket" hint instead of hiding it under the generic fallback's details tooltip.
  if (/thumbcache_idx/i.test(raw)) return 'Thumbnail index file - no images inside. Open a sibling thumbcache_*.db (e.g. thumbcache_256.db).'
  return 'Unsupported file - not a recognized thumbnail database.'
}
