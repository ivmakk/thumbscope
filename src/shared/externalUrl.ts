// Scheme guard for the `openExternal` IPC. The renderer supplies the URL (Help-menu link
// constants); main only hands it to shell.openExternal when this passes, so a stray non-web
// scheme (file:, javascript:) can't be launched. Pure + no Electron import so node --test covers it.

export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
