// Generate a SFW Thumbs.db for GUI testing with a classic 16-byte catalog (filenames, FILETIME
// dates, UTF-16LE names, digit-reversed stream names). Three modes:
//   default  — ~100 distinct synthetic colored-gradient JPEG thumbnails (no source files needed).
//   --real   — classic JPEG thumbnails resized from the CC0/PD photo pack in sample/images/ (one per image).
//   --winxp  — the same photo pack encoded as Windows XP "abbrev-jpeg" thumbnails (abbreviated 4-component
//              R,G,B,A CMYK JPEGs, no DQT/DHT), to exercise the abbrev-jpeg decode path end-to-end.
//   --png    — the same photo pack encoded as a hashed-png container (no Catalog, `256_<hash>` stream
//              names, 24-byte MS prefix + PNG), to exercise the PNG passthrough path end-to-end.
//   --photothumb — the same photo pack written as a PhotoScape-style SQLite `photothumb.db` (a single
//              `thumb(fname,tcreate,tmodify,fsize,width,height,image)` table, JFIF JPEG blobs), to
//              exercise the non-OLE2 SQLite path end-to-end.
//   --thumbcache — a Windows Explorer `CMMM` cache (thumbcache_96.db): 8 procedural 48px icons with
//              transparency, stored as 32bpp BMP-V5 + premultiplied alpha (the small-bucket layout).
//   --thumbcache-jpeg — a `CMMM` cache (thumbcache_1280.db): ~10 JPEG thumbnails from the photo pack
//              (the large-bucket layout). Both exercise the non-OLE2 thumbcache path end-to-end.
// No personal data either way. Usage:
//   node scripts/make-sample-thumbsdb.mjs [outPath] [count]          # synthetic
//   node scripts/make-sample-thumbsdb.mjs --real [outPath]           # real photos, classic JPEG
//   node scripts/make-sample-thumbsdb.mjs --winxp [outPath]          # real photos, XP abbrev-jpeg
//   node scripts/make-sample-thumbsdb.mjs --png [outPath]            # real photos, hashed-png
//   node scripts/make-sample-thumbsdb.mjs --photothumb [outPath]     # real photos, SQLite photothumb.db
//   node scripts/make-sample-thumbsdb.mjs --thumbcache [outPath]     # procedural icons, CMMM BMP-V5 alpha
//   node scripts/make-sample-thumbsdb.mjs --thumbcache-jpeg [outPath] # real photos, CMMM JPEG

import { writeFile, readdir, mkdir, stat, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import CFB from 'cfb'
import sharp from 'sharp'
import { encodeAbbrevJpeg } from './lib/encode-abbrev.mjs'
import { buildThumbcacheDb, makeBmpV5 } from '../src/core/fixture.ts'

const rawArgs = process.argv.slice(2)
const KNOWN_FLAGS = ['--real', '--winxp', '--png', '--photothumb', '--thumbcache', '--thumbcache-jpeg']
const unknownFlag = rawArgs.find((a) => a.startsWith('-') && !KNOWN_FLAGS.includes(a))
if (unknownFlag) throw new Error(`unknown flag: ${unknownFlag} (flags: ${KNOWN_FLAGS.join(', ')})`)
const real = rawArgs.includes('--real')
const winxp = rawArgs.includes('--winxp')
const png = rawArgs.includes('--png')
const photothumb = rawArgs.includes('--photothumb')
const thumbcache = rawArgs.includes('--thumbcache')
const thumbcacheJpeg = rawArgs.includes('--thumbcache-jpeg')
if ([real, winxp, png, photothumb, thumbcache, thumbcacheJpeg].filter(Boolean).length > 1)
  throw new Error('--real, --winxp, --png, --photothumb, --thumbcache and --thumbcache-jpeg are mutually exclusive')
const usesPack = real || winxp || png || photothumb || thumbcacheJpeg // pack modes draw from the photo pack
const positionals = rawArgs.filter((a) => !a.startsWith('-'))
const imagesDir = 'sample/images'
const outPath =
  positionals[0] ||
  (thumbcacheJpeg ? 'sample/thumbcache_1280.db' : thumbcache ? 'sample/thumbcache_96.db' : photothumb ? 'sample/photothumb.db' : png ? 'sample/Thumbs-png.db' : winxp ? 'sample/Thumbs-winxp.db' : real ? 'sample/Thumbs-real.db' : 'sample/Thumbs.db')
// Pack modes derive the thumbnail count from the image pack, so a count arg would be a silent no-op.
if (usesPack && positionals[1] !== undefined) throw new Error('--real / --winxp / --png / --photothumb take no count (they use every image in the pack)')
const count = Number(positionals[1]) || 100

// thumbcache (`CMMM`) sample modes: a flat non-OLE2 container, so they don't touch the CFB/catalog flow
// below - build and write here, then exit. Deterministic 8-byte hash per entry stands in for the real
// ThumbnailCacheId (the format has no filenames). Reuses the parser's own fixture framing so the bytes
// stay byte-for-byte what the tests build.
if (thumbcache || thumbcacheJpeg) {
  const hashFor = (i) => createHash('md5').update(`thumbcache:${i}`).digest().subarray(0, 8)
  const entries = []
  let label
  if (thumbcacheJpeg) {
    const files = (await loadRealImages(imagesDir)).slice(0, 10) // ~10 keeps the committed sample small
    for (let idx = 0; idx < files.length; idx++) {
      entries.push({ hash: hashFor(idx + 1), data: await makeRealJpeg(join(imagesDir, files[idx]), 160, 160) })
    }
    label = `${entries.length} JPEG thumbnails`
  } else {
    const N = 8
    for (let i = 1; i <= N; i++) entries.push({ hash: hashFor(i), data: await makeIconBmpV5(i, 48) })
    label = `${N} BMP-V5 transparent icons`
  }
  const buf = buildThumbcacheDb({ version: 32, entries })
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buf)
  console.log(`wrote ${outPath} — ${label}, ${(buf.length / 1024).toFixed(0)} KB`)
  process.exit(0)
}

// HSV->RGB for varied hues across the set.
function hsv(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// A 48px procedural icon with a transparent background (a hued disc + index digit), encoded as the
// small-bucket thumbcache payload: 32bpp BMP-V5 with premultiplied alpha. sharp yields straight RGBA;
// BMP-V5 stores premultiplied BGRA, so premultiply here (the parser un-premultiplies back on open).
async function makeIconBmpV5(i, size) {
  const [r, g, b] = hsv((i * 47) % 360, 0.62, 0.95)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="rgb(${r},${g},${b})"/>
    <text x="50%" y="63%" font-family="Arial, sans-serif" font-size="${Math.round(size * 0.5)}"
      font-weight="bold" fill="rgba(255,255,255,0.95)" text-anchor="middle">${i}</text>
  </svg>`
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const stored = []
  for (let p = 0; p < info.width * info.height; p++) {
    const R = data[p * 4], G = data[p * 4 + 1], B = data[p * 4 + 2], A = data[p * 4 + 3]
    stored.push([Math.round((B * A) / 255), Math.round((G * A) / 255), Math.round((R * A) / 255), A])
  }
  return makeBmpV5(info.width, info.height, stored)
}

async function makeJpeg(i, w, h) {
  const [r, g, b] = hsv((i * 37) % 360, 0.55, 0.9)
  const [r2, g2, b2] = hsv((i * 37 + 40) % 360, 0.7, 0.6)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgb(${r},${g},${b})"/>
      <stop offset="1" stop-color="rgb(${r2},${g2},${b2})"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.18}" fill="rgba(255,255,255,0.85)"/>
    <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.32)}"
      font-weight="bold" fill="rgba(0,0,0,0.65)" text-anchor="middle">#${i}</text>
    <text x="50%" y="78%" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.12)}"
      fill="rgba(255,255,255,0.9)" text-anchor="middle">${w}×${h}</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

// Resize a real source photo down to a thumbnail box (aspect preserved, no enlargement). sharp drops
// all input metadata by default, so the output JPEG carries no EXIF/GPS/etc.
async function makeRealJpeg(src, w, h) {
  return sharp(src).resize(w, h, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
}

// Resize a real source photo and encode it as an abbreviated XP abbrev-jpeg stream (4-component R,G,B,A,
// no DQT/DHT). The parser reconstructs the tables and decodeAbbrevRgb renders it back to faithful RGB.
async function makeWinxpStream(src, w, h) {
  const { data, info } = await sharp(src)
    .resize(w, h, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return encodeAbbrevJpeg(data, info.width, info.height)
}

// Resize a real source photo to a 256px box and emit a hashed-png stream: 24-byte MS prefix
// (headerSize=24, type=3 for PNG, dataSize; checksum left zero - the parser routes by signature) + PNG.
// Palette-quantized so the committed sample stays small (PNG-encoded photos are otherwise bulky).
async function makePngStream(src) {
  const data = await sharp(src).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png({ palette: true, colors: 64 }).toBuffer()
  const pre = Buffer.alloc(24)
  pre.writeUInt32LE(24, 0) // header size
  pre.writeUInt32LE(3, 4) // payload type = 3 (PNG)
  pre.writeUInt32LE(data.length, 8) // data size
  return Buffer.concat([pre, data])
}

// hashed-png stream name: `256_<16 hex>`. Hash derived from the filename so output is deterministic.
const pngStreamName = (name) => `256_${createHash('md5').update(name).digest('hex').slice(0, 16)}`

// Read the CC0/PD pack (sample/images/IMG_NNNN.JPG) in deterministic sorted order.
async function loadRealImages(dir) {
  // Require exactly 4 digits (IMG_NNNN.JPG): the pack's zero-padded convention, so lexical .sort() is numeric order.
  const files = (await readdir(dir)).filter((f) => /^IMG_\d{4}\.JPG$/i.test(f)).sort()
  if (files.length === 0) throw new Error(`no IMG_NNNN.JPG images found in ${dir}`)
  return files
}

function dateToFiletime(date) {
  const ft = (date.getTime() + 11644473600000) * 10000
  return { lo: ft % 4294967296, hi: Math.floor(ft / 4294967296) }
}

function buildCatalog(items) {
  const header = Buffer.alloc(16)
  header.writeUInt16LE(16, 0)
  header.writeUInt16LE(7, 2)
  header.writeUInt32LE(items.length, 4)
  header.writeUInt32LE(96, 8)
  header.writeUInt32LE(96, 12)
  const parts = [header]
  for (const it of items) {
    const nameBuf = Buffer.from(it.name + '\0', 'utf16le')
    const e = Buffer.alloc(16)
    e.writeUInt32LE(16 + nameBuf.length, 0)
    e.writeUInt32LE(it.index, 4)
    const { lo, hi } = dateToFiletime(it.date)
    e.writeUInt32LE(lo, 8)
    e.writeUInt32LE(hi, 12)
    parts.push(Buffer.concat([e, nameBuf]))
  }
  return Buffer.concat(parts)
}

const reverseDigits = (n) => String(n).split('').reverse().join('')

// A few non-ASCII names to exercise UTF-16 handling (Korean, South-Slavic Cyrillic, French diacritics).
const fancy = ['바다', '하늘', 'café', 'naïve', 'планина']
const sizes = [
  [160, 120], [120, 160], [200, 150], [96, 96], [256, 144], [150, 200]
]

const items = []
const base = Date.UTC(2008, 0, 1)
if (usesPack) {
  // One thumbnail per source photo, keeping its real (already-generic) IMG_NNNN.JPG filename.
  // PNG mode keeps just a handful (PNG payloads are large) - enough to exercise the variant.
  const PNG_SAMPLE_COUNT = 4
  const files = png ? (await loadRealImages(imagesDir)).slice(0, PNG_SAMPLE_COUNT) : await loadRealImages(imagesDir)
  files.forEach((file, idx) => {
    const i = idx + 1
    const [w, h] = sizes[i % sizes.length]
    items.push({ index: i, name: file, date: new Date(base + i * 86400000 * 3), w, h, src: join(imagesDir, file) })
  })
} else {
  for (let i = 1; i <= count; i++) {
    const [w, h] = sizes[i % sizes.length]
    const name = i % 11 === 0 ? `${fancy[i % fancy.length]}_${i}.jpg` : `IMG_${String(i).padStart(4, '0')}.JPG`
    items.push({ index: i, name, date: new Date(base + i * 86400000 * 3), w, h })
  }
}

// Encode in bounded-concurrency batches (sharp releases the event loop), preserving order. A fixed
// pool keeps memory bounded even when synthetic `count` is large, while still beating a serial loop.
const POOL = 8
const payloads = [] // per-mode stream bytes: JPEG, XP abbrev-jpeg, or prefixed PNG
for (let i = 0; i < items.length; i += POOL) {
  const batch = items.slice(i, i + POOL)
  payloads.push(
    ...(await Promise.all(
      batch.map((it) =>
        png ? makePngStream(it.src) : winxp ? makeWinxpStream(it.src, it.w, it.h) : it.src ? makeRealJpeg(it.src, it.w, it.h) : makeJpeg(it.index, it.w, it.h)
      )
    ))
  )
}
// Ensure the output dir exists before writing.
await mkdir(dirname(outPath), { recursive: true })

if (photothumb) {
  // PhotoScape-style SQLite cache: a single `thumb` table. Columns hold the ORIGINAL photo's
  // mtime/size/dimensions; the blob is the thumbnail JPEG (payloads[i]). DatabaseSync opens a path
  // and CREATE TABLE fails on a stale file, so start from a clean path.
  await rm(outPath, { force: true })
  const db = new DatabaseSync(outPath)
  try {
    db.exec('CREATE TABLE thumb(fname text primary key, tcreate int, tmodify int, fsize int, width int, height int, image blob)')
    const ins = db.prepare('INSERT INTO thumb(fname, tcreate, tmodify, fsize, width, height, image) VALUES (?,?,?,?,?,?,?)')
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const meta = await sharp(it.src).metadata() // original photo dimensions
      const { size } = await stat(it.src) // original photo file size
      const tmodify = Math.floor(it.date.getTime() / 1000) // original mtime, Unix seconds
      ins.run(it.name, tmodify + 3600, tmodify, size, meta.width, meta.height, payloads[i])
    }
  } finally {
    db.close()
  }
  const { size } = await stat(outPath)
  console.log(`wrote ${outPath} — ${items.length} thumbnails, ${(size / 1024).toFixed(0)} KB`)
} else {
  const cfb = CFB.utils.cfb_new()
  if (png) {
    // hashed-png: no Catalog; streams named `256_<hash>` carry the prefixed PNG payload.
    items.forEach((it, i) => CFB.utils.cfb_add(cfb, '/' + pngStreamName(it.name), payloads[i]))
  } else {
    CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items))
    items.forEach((it, i) => CFB.utils.cfb_add(cfb, '/' + reverseDigits(it.index), payloads[i]))
  }
  const buf = Buffer.from(CFB.write(cfb, { type: 'buffer' }))
  await writeFile(outPath, buf)
  console.log(`wrote ${outPath} — ${items.length} thumbnails, ${(buf.length / 1024).toFixed(0)} KB`)
}
