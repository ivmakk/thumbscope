import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { thumbUrl } from '@/lib/imageCache'
import { CHECKERBOARD_STYLE } from '@/lib/transparency'

// Renders a thumbnail by stream name. `src` is a sync `thumb://` URL - Chromium's loader fetches and
// caches it; only mounted for visible (virtualized) items. A skeleton shows until the <img> fires
// load; on error it's dropped so the tile shows the broken-image state, not a perpetual pulse.
// `backdrop` draws a checkerboard behind transparent (rgba) payloads so their edges read.
export function ThumbImage({
  streamName,
  version,
  alt,
  className,
  style,
  backdrop = false
}: {
  streamName: string
  version: number // open generation; changes the URL so a new file reusing stream names refetches
  alt: string
  className?: string
  style?: React.CSSProperties
  backdrop?: boolean
}): React.JSX.Element {
  const src = thumbUrl(streamName, version)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // Reset the skeleton when the URL changes (new file/stream); sync, no fetch.
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [src])

  const imgStyle = backdrop ? { ...style, ...CHECKERBOARD_STYLE } : style
  return (
    <>
      {!loaded && !failed && <div className={cn('animate-pulse bg-muted', className)} style={style} />}
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ ...imgStyle, ...(loaded ? null : { display: 'none' }) }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  )
}
