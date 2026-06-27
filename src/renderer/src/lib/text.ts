// Filename splitting for middle-ellipsis rendering (see FileName.tsx).
// Pure, no DOM/React — unit-tested directly under `node --test`.

const DIGIT_CAP = 4 // protect at most this many trailing stem digits (IMG_0123)

/**
 * Split a label into a head (ellipsizable) and a protected tail.
 * - No real extension (no dot, leading-dot dotfile, trailing dot) -> tail is
 *   empty; the caller renders a plain end-ellipsis.
 * - Has extension -> tail is the extension plus up to DIGIT_CAP trailing stem
 *   digits, so sequential photo names stay distinguishable (IMG_…0123.jpg).
 *
 * Guarantee: head + tail === label exactly (no inserted/dropped characters).
 */
export function splitName(label: string): { head: string; tail: string } {
  const dot = label.lastIndexOf('.')
  if (dot <= 0 || dot === label.length - 1) return { head: label, tail: '' }
  const stem = label.slice(0, dot)
  const ext = label.slice(dot) // includes the dot
  let d = 0
  while (d < stem.length && d < DIGIT_CAP && stem[stem.length - 1 - d] >= '0' && stem[stem.length - 1 - d] <= '9') d++
  return { head: stem.slice(0, stem.length - d), tail: stem.slice(stem.length - d) + ext }
}
