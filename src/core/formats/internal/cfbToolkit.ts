// Internal seam shared by the CFB-family container handlers (cfb + irfanview): the low-level OLE2
// plumbing none of them should re-implement. Not part of any handler's public interface — exercised
// only through parseThumbsDb / openThumbnailDb.

import CFB from 'cfb'

// Open an OLE2/CFB compound file from a buffer. Throws (cfb's own error) when the bytes are not a
// compound file; the orchestrator catches that to route to carve recovery.
export function readCfb(buffer: Buffer): ReturnType<typeof CFB.read> {
  return CFB.read(buffer, { type: 'buffer' })
}

// Iterate real content streams: directory entries of type 2 (stream), skipping control-prefixed names
// (OLE metadata like \x05SummaryInformation and the SheetJS \x01 watermark our fixture writer injects).
// `content` is the stream's bytes as cfb returns them (already a Buffer for type:'buffer' reads) - not
// copied; all consumers (classify -> slice/parse) read it without mutating.
export function streams(cfb: ReturnType<typeof CFB.read>): { name: string; content: Buffer }[] {
  const out: { name: string; content: Buffer }[] = []
  for (const e of cfb.FileIndex) {
    if (e.type !== 2 || e.name.charCodeAt(0) < 0x20) continue
    const content = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content as Uint8Array)
    out.push({ name: e.name, content })
  }
  return out
}

// FILETIME (100ns ticks since 1601) -> JS Date. Null when zero (no date recorded).
export function filetimeToDate(lo: number, hi: number): Date | null {
  const ft = hi * 4294967296 + lo // 64-bit, fits in double for realistic dates
  if (!ft) return null
  const ms = ft / 10000 - 11644473600000
  return new Date(ms)
}
