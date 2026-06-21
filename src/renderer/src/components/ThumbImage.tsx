import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getThumbUrl } from '@/lib/imageCache'

// Renders a thumbnail by stream name, lazily pulling bytes via IPC. Only mounted for visible
// (virtualized) items, so no extra intersection logic is needed.
export function ThumbImage({
  streamName,
  version,
  alt,
  className,
  style
}: {
  streamName: string
  version: number // open generation; bumps to force refetch when a new file reuses stream names
  alt: string
  className?: string
  style?: React.CSSProperties
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
  return <img src={url} alt={alt} loading="lazy" className={className} style={style} />
}
