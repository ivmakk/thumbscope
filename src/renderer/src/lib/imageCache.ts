// Lazily fetch thumbnail bytes from main over IPC and cache blob URLs by stream name.
// Reset on each new file open to release memory.
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

export function resetImageCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url)
  cache.clear()
  inflight.clear()
}

export function getThumbUrl(streamName: string): Promise<string | null> {
  const cached = cache.get(streamName)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(streamName)
  if (pending) return pending
  const p = window.api.getImage(streamName).then((r) => {
    inflight.delete(streamName)
    if (!r) return null
    const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: r.mime }))
    cache.set(streamName, url)
    return url
  })
  inflight.set(streamName, p)
  return p
}
