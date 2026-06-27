// Classic / modern Thumbs.db container handler: an OLE2 file with a `Catalog` stream (catalog-jpeg,
// catalog-jpeg-guid, catalog-dib) and/or hashed `<size>_<hash>` streams (hashed-jpeg, hashed-png).
// Deep module: small ContainerHandler interface, the whole catalog + hashed stream loop hidden inside.

import type { CatalogEntry, ParseResult, ThumbEntry } from '../../types.ts'
import type { CfbCtx, ContainerHandler } from '../types.ts'
import { classify } from '../codec/classify.ts'
import { streams, filetimeToDate } from '../internal/cfbToolkit.ts'
import { makeEntry } from '../internal/entry.ts'

const DIGITS = /^[0-9]+$/
const SIZE_HASH = /^[0-9]+_[0-9a-fA-F]+$/
const GUID = /^\{[0-9a-fA-F-]+\}$/

// Parse Catalog stream -> Map<index, {name, date}>.
// Header length is read from the stream (8 for ehthumbs, 16 for classic); entry layout is shared.
function parseCatalog(buf: Buffer): Map<number, CatalogEntry> {
  const map = new Map<number, CatalogEntry>()
  if (!buf || buf.length < 8) return map
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let off = dv.getUint16(0, true) // header length
  if (off < 8 || off > buf.length) off = 16
  while (off + 16 <= buf.length) {
    const entryLen = dv.getUint32(off, true)
    if (entryLen < 16 || off + entryLen > buf.length) break
    const index = dv.getUint32(off + 4, true)
    const lo = dv.getUint32(off + 8, true)
    const hi = dv.getUint32(off + 12, true)
    const date = filetimeToDate(lo, hi)
    const nameBytes = buf.subarray(off + 16, off + entryLen)
    const name = Buffer.from(nameBytes).toString('utf16le').replace(/\0+$/g, '').trim()
    map.set(index, { name, date })
    off += entryLen
  }
  return map
}

// stream name digits are stored reversed: "21" -> index 12
function streamNameToIndex(name: string): number | null {
  const m = name.replace(/[^0-9]/g, '')
  if (!m) return null
  return parseInt(m.split('').reverse().join(''), 10)
}

// Catalog "names" are sometimes GUIDs (catalog-jpeg-guid); treat those as no real name.
function realName(name: string | undefined): string | null {
  if (!name || GUID.test(name)) return null
  return name
}

function isThumbStream(name: string): boolean {
  return DIGITS.test(name) || SIZE_HASH.test(name)
}

export const cfbHandler: ContainerHandler = {
  slug: 'cfb',

  // Positive signature: a Catalog stream or any digit/hash-named thumb stream is present.
  detect(ctx: CfbCtx): boolean {
    return streams(ctx.cfb).some((s) => s.name === 'Catalog' || isThumbStream(s.name))
  },

  parse(ctx: CfbCtx): ParseResult {
    let catalog = new Map<number, CatalogEntry>()
    const thumbStreams: { name: string; content: Buffer }[] = []
    for (const s of streams(ctx.cfb)) {
      if (s.name === 'Catalog') catalog = parseCatalog(s.content)
      else if (isThumbStream(s.name)) thumbStreams.push(s)
    }

    const entries: ThumbEntry[] = []
    let failed = 0
    for (const s of thumbStreams) {
      const payload = classify(s.content)
      if (!payload) {
        failed++
        continue
      }

      let index: number | null = null
      let name: string | null = null
      let date: Date | null = null
      let label: string

      if (SIZE_HASH.test(s.name)) {
        // Vista: no catalog; label is the hash after the underscore.
        label = s.name.slice(s.name.indexOf('_') + 1)
      } else {
        index = streamNameToIndex(s.name)
        const meta = (index != null && catalog.get(index)) || undefined
        name = realName(meta?.name)
        date = meta?.date ?? null
        label = name ?? (index != null ? `#${index}` : s.name)
      }

      entries.push(makeEntry({ index, streamName: s.name, name, label, date, payload }))
    }

    entries.sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.streamName.localeCompare(b.streamName))
    return { count: entries.length, failed, catalogCount: catalog.size, entries, recovered: false, format: 'cfb' }
  }
}
