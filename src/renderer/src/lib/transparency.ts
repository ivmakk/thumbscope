import type { CSSProperties } from 'react'
import type { ThumbMeta } from '../../../preload'

// Only the straight-RGBA payload (thumbcache small buckets) carries a real alpha channel; every other
// payload kind is opaque, so a checkerboard behind it would just be noise. Pure predicate - unit-tested.
export function needsCheckerboard(format: ThumbMeta['format']): boolean {
  return format === 'rgba'
}

// A subtle checkerboard drawn behind transparent thumbnails so their edges read against the canvas.
// Neutral gray at low opacity works in both light and dark themes without a dedicated token.
export const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgba(120,120,120,0.16) 25%, transparent 25%), linear-gradient(-45deg, rgba(120,120,120,0.16) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(120,120,120,0.16) 75%), linear-gradient(-45deg, transparent 75%, rgba(120,120,120,0.16) 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0'
}
