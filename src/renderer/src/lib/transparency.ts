import type { CSSProperties } from 'react'
import type { ThumbMeta } from '../../../preload'

// Draw the checkerboard only behind a thumbnail with genuinely translucent pixels (decode-time
// `hasAlpha`), not merely one tagged as the 32bpp rgba codec - an opaque 32bpp icon/photo in a mixed
// thumbcache bucket would otherwise get a needless checkerboard in its letterbox margins. Pure
// predicate - unit-tested.
export function needsCheckerboard(meta: Pick<ThumbMeta, 'hasAlpha'>): boolean {
  return meta.hasAlpha
}

// A subtle checkerboard drawn behind transparent thumbnails so their edges read against the canvas.
// Neutral gray at low opacity works in both light and dark themes without a dedicated token.
export const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgba(120,120,120,0.16) 25%, transparent 25%), linear-gradient(-45deg, rgba(120,120,120,0.16) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(120,120,120,0.16) 75%), linear-gradient(-45deg, transparent 75%, rgba(120,120,120,0.16) 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0'
}
