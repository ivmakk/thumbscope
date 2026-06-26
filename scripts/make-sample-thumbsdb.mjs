// Generate a SFW Thumbs.db for GUI testing with a classic 16-byte catalog (filenames, FILETIME
// dates, UTF-16LE names, digit-reversed stream names). Three modes:
//   default  — ~100 distinct synthetic colored-gradient JPEG thumbnails (no source files needed).
//   --real   — classic JPEG thumbnails resized from the CC0/PD photo pack in sample/images/ (one per image).
//   --winxp  — the same photo pack encoded as Windows XP "abbrev-jpeg" thumbnails (abbreviated 4-component
//              R,G,B,A CMYK JPEGs, no DQT/DHT), to exercise the abbrev-jpeg decode path end-to-end.
//   --png    — the same photo pack encoded as a hashed-png container (no Catalog, `256_<hash>` stream
//              names, 24-byte MS prefix + PNG), to exercise the PNG passthrough path end-to-end.
// No personal data either way. Usage:
//   node scripts/make-sample-thumbsdb.mjs [outPath] [count]          # synthetic
//   node scripts/make-sample-thumbsdb.mjs --real [outPath]           # real photos, classic JPEG
//   node scripts/make-sample-thumbsdb.mjs --winxp [outPath]          # real photos, XP abbrev-jpeg
//   node scripts/make-sample-thumbsdb.mjs --png [outPath]            # real photos, hashed-png

import { writeFile, readdir, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import CFB from 'cfb'
import sharp from 'sharp'
import { encodeAbbrevJpeg } from './lib/encode-abbrev.mjs'

const rawArgs = process.argv.slice(2)
const KNOWN_FLAGS = ['--real', '--winxp', '--png']
const unknownFlag = rawArgs.find((a) => a.startsWith('-') && !KNOWN_FLAGS.includes(a))
if (unknownFlag) throw new Error(`unknown flag: ${unknownFlag} (flags: ${KNOWN_FLAGS.join(', ')})`)
const real = rawArgs.includes('--real')
const winxp = rawArgs.includes('--winxp')
const png = rawArgs.includes('--png')
if ([real, winxp, png].filter(Boolean).length > 1) throw new Error('--real, --winxp and --png are mutually exclusive')
const usesPack = real || winxp || png // all three modes draw from the photo pack
const positionals = rawArgs.filter((a) => !a.startsWith('-'))
const imagesDir = 'sample/images'
const outPath = positionals[0] || (png ? 'sample/Thumbs-png.db' : winxp ? 'sample/Thumbs-winxp.db' : real ? 'sample/Thumbs-real.db' : 'sample/Thumbs.db')
// Pack modes derive the thumbnail count from the image pack, so a count arg would be a silent no-op.
if (usesPack && positionals[1] !== undefined) throw new Error('--real / --winxp / --png take no count (they use every image in the pack)')
const count = Number(positionals[1]) || 100

// HSV->RGB for varied hues across the set.
function hsv(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
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
const jpegs = []
for (let i = 0; i < items.length; i += POOL) {
  const batch = items.slice(i, i + POOL)
  jpegs.push(
    ...(await Promise.all(
      batch.map((it) =>
        png ? makePngStream(it.src) : winxp ? makeWinxpStream(it.src, it.w, it.h) : it.src ? makeRealJpeg(it.src, it.w, it.h) : makeJpeg(it.index, it.w, it.h)
      )
    ))
  )
}
const cfb = CFB.utils.cfb_new()
if (png) {
  // hashed-png: no Catalog; streams named `256_<hash>` carry the prefixed PNG payload.
  items.forEach((it, i) => CFB.utils.cfb_add(cfb, '/' + pngStreamName(it.name), jpegs[i]))
} else {
  CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items))
  items.forEach((it, i) => CFB.utils.cfb_add(cfb, '/' + reverseDigits(it.index), jpegs[i]))
}
const buf = Buffer.from(CFB.write(cfb, { type: 'buffer' }))

// Ensure the output dir exists, then write.
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, buf)
console.log(`wrote ${outPath} — ${items.length} thumbnails, ${(buf.length / 1024).toFixed(0)} KB`)
