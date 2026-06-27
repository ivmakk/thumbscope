// Map main's raw error text to a short, end-user message. Pure, no DOM/React.

export function friendlyError(raw: string): string {
  if (/folder/i.test(raw)) return 'No Thumbs.db or ehthumbs.db found in that folder.'
  if (/could not (read|open)/i.test(raw)) return "Couldn't open that file."
  return 'Unsupported file — not a Thumbs.db or ehthumbs.db.'
}
