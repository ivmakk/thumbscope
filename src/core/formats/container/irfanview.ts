// IrfanView ivThumbs.db container handler: an OLE2 file marked by a `_Thumbs_DB_Ver` stream. Two
// sub-variants share this handler (an internal seam, not two registry entries): flat (each stream named
// with the original filename, payload = 16-byte prefix + BMP) and nested (filenames are CFB storages
// with no start sector, so the BMP blocks are carved from the raw buffer).

import type { Payload, ParseResult, ThumbEntry } from '../../types.ts'
import type { CfbCtx, ContainerHandler } from '../types.ts'
import { classify } from '../codec/classify.ts'
import { parseBmp } from '../codec/bmp.ts'
import { streams, filetimeToDate } from '../internal/cfbToolkit.ts'
import { makeEntry } from '../internal/entry.ts'

const IRFAN_VER_STREAM = '_Thumbs_DB_Ver'
const IRFAN_PREFIX = 16 // FILETIME(8) + 2x u32

// Read the FILETIME that prefixes an IrfanView payload.
function irfanDate(content: Buffer): Date | null {
  if (content.length < 8) return null
  const dv = new DataView(content.buffer, content.byteOffset, content.byteLength)
  return filetimeToDate(dv.getUint32(0, true), dv.getUint32(4, true))
}

// IrfanView payload = 16-byte prefix + BMP. Strip the prefix and decode the BMP to a DIB payload
// (reusing the display/export pipeline). Fall back to a generic classify if the body isn't a BMP.
function classifyIrfan(content: Buffer): Payload | null {
  const body = content.length > IRFAN_PREFIX ? content.subarray(IRFAN_PREFIX) : content
  const bmp = parseBmp(body)
  if (bmp) return { kind: 'dib', width: bmp.width, height: bmp.height, pixels: bmp.pixels }
  return classify(content)
}

function parseFlat(ctx: CfbCtx): ParseResult {
  const entries: ThumbEntry[] = []
  let failed = 0
  // streams() already skips control-prefixed OLE metadata; only the version marker needs filtering.
  for (const s of streams(ctx.cfb)) {
    if (s.name === IRFAN_VER_STREAM) continue
    const payload = classifyIrfan(s.content)
    if (!payload) {
      failed++
      continue
    }
    entries.push(
      makeEntry({
        index: null,
        streamName: s.name,
        name: s.name, // stream name is the original filename
        label: s.name,
        date: irfanDate(s.content),
        payload
      })
    )
  }
  entries.sort((a, b) => a.streamName.localeCompare(b.streamName))
  return { count: entries.length, failed, catalogCount: 0, entries, recovered: false, format: 'irfanview-flat' }
}

// Nested ivThumbs.db: each filename is a CFB *storage* whose directory entry carries the stream size but
// no start sector (objType 0, start = ENDOFCHAIN) — so the standard reader can't reach the bytes (the
// flat parse yields zero). The payloads still sit in the file as a regular grid of [16-byte prefix +
// complete BMP] blocks, so carve them directly. A block is a `BM` header with a BITMAPINFOHEADER,
// preceded by a prefix whose two trailing u32 flags are both 1.
interface IrfanBlock {
  prefixOff: number
  bmpOff: number
  bmpSize: number
  date: Date | null
}

function carveIrfanBlocks(buf: Buffer): IrfanBlock[] {
  if (buf.length < IRFAN_PREFIX + 54) return []
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const cands: IrfanBlock[] = []
  for (let i = IRFAN_PREFIX; i + 54 < buf.length; i++) {
    if (buf[i] !== 0x42 || buf[i + 1] !== 0x4d) continue // 'BM'
    if (dv.getUint32(i + 10, true) !== 54 || dv.getUint32(i + 14, true) !== 40) continue // dataOffset, BIH size
    if (dv.getUint32(i - 8, true) !== 1 || dv.getUint32(i - 4, true) !== 1) continue // prefix flag signature
    const bmpSize = dv.getUint32(i + 2, true)
    if (bmpSize < 54 || i + bmpSize > buf.length) continue
    cands.push({ prefixOff: i - IRFAN_PREFIX, bmpOff: i, bmpSize, date: irfanDate(buf.subarray(i - IRFAN_PREFIX)) })
  }
  // Keep a non-overlapping sequence. A spurious leading hit (a master/preview BMP embedded in the
  // header region) overlaps the first real block, so if the first candidate overlaps the second,
  // start carving from the second instead.
  const pick = (list: IrfanBlock[]): IrfanBlock[] => {
    const out: IrfanBlock[] = []
    let end = -1
    for (const c of list) {
      if (c.prefixOff >= end) {
        out.push(c)
        end = c.bmpOff + c.bmpSize
      }
    }
    return out
  }
  if (cands.length > 1 && cands[0].bmpOff + cands[0].bmpSize > cands[1].prefixOff) return pick(cands.slice(1))
  return pick(cands)
}

function parseNested(ctx: CfbCtx): ParseResult {
  const blocks = carveIrfanBlocks(ctx.buffer)
  if (blocks.length === 0) {
    return { count: 0, failed: 0, catalogCount: 0, entries: [], recovered: false, format: 'irfanview-nested' }
  }
  // Ordered leaf names from the directory (the storages). Pair with carved blocks by position only
  // when the counts match exactly — without start sectors the filename↔block mapping is best-effort.
  const names = ctx.cfb.FileIndex.filter(
    (e) => e.type !== 5 && e.name !== IRFAN_VER_STREAM && e.name.charCodeAt(0) >= 0x20
  ).map((e) => e.name)
  const paired = names.length === blocks.length

  const entries: ThumbEntry[] = []
  let failed = 0
  blocks.forEach((blk, i) => {
    const bmp = parseBmp(ctx.buffer.subarray(blk.bmpOff, blk.bmpOff + blk.bmpSize))
    if (!bmp) {
      failed++
      return
    }
    const name = paired ? names[i] : null
    entries.push(
      makeEntry({
        index: null,
        streamName: `ivnested-${i + 1}`,
        name,
        label: name ?? `#${i + 1}`,
        date: blk.date,
        payload: { kind: 'dib', width: bmp.width, height: bmp.height, pixels: bmp.pixels }
      })
    )
  })
  return { count: entries.length, failed, catalogCount: 0, entries, recovered: false, format: 'irfanview-nested' }
}

export const irfanviewHandler: ContainerHandler = {
  slug: 'irfanview',

  detect(ctx: CfbCtx): boolean {
    return ctx.cfb.FileIndex.some((e) => e.type === 2 && e.name === IRFAN_VER_STREAM)
  },

  // Flat first (filename streams); if that yields nothing, the nested-storage variant.
  parse(ctx: CfbCtx): ParseResult {
    const flat = parseFlat(ctx)
    if (flat.count > 0) return flat
    return parseNested(ctx)
  }
}
