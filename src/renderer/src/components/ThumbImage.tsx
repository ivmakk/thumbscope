import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getThumbUrl } from '@/lib/imageCache'
import { CHECKERBOARD_STYLE } from '@/lib/transparency'

// Renders a thumbnail by stream name, lazily pulling bytes via IPC. Only mounted for visible
// (virtualized) items, so no extra intersection logic is needed. `backdrop` draws a checkerboard behind
// transparent (rgba) payloads so their edges read against the tile.
export function ThumbImage({
  streamName,
  version,
  alt,
  className,
  style,
  backdrop = false
}: {
  streamName: string
  version: number // open generation; bumps to force refetch when a new file reuses stream names
  alt: string
  className?: string
  style?: React.CSSProperties
  backdrop?: boolean
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    getThumbUrl(streamName).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [streamName, version])

  if (!url) return <div className={cn('animate-pulse bg-muted', className)} style={style} />
  const imgStyle = backdrop ? { ...style, ...CHECKERBOARD_STYLE } : style
  return <img src={url} alt={alt} loading="lazy" className={className} style={imgStyle} />
}
