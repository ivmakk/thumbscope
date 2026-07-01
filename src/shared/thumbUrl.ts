// Pure URL seam for the `thumb://` custom protocol (Chromium-owned thumbnail transport).
// Shared by main (the protocol handler) and renderer (the <img> src builder); no Electron/DOM
// imports so it unit-tests under node:test. The (version, streamName) pair is a unique key for
// the currently-open session: streamName is unique within one open DB (it keys main's entries
// Map), and version (the open generation) busts Chromium's URL cache when a re-opened file
// reuses stream names.

const PREFIX = 'thumb://img/'

export function thumbUrl(streamName: string, version: number): string {
  return `${PREFIX}${version}/${encodeURIComponent(streamName)}`
}

// Extracts the stream name from a thumb:// URL, or null for anything that isn't one (the
// handler's miss/404 guard).
export function parseThumbUrl(url: string): string | null {
  if (!url.startsWith(PREFIX)) return null
  const rest = url.slice(PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return null
  try {
    return decodeURIComponent(rest.slice(slash + 1))
  } catch {
    return null // malformed percent-escape (e.g. a lone `%`) -> treat as a miss, not a throw
  }
}
