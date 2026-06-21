// Generate a synthetic, SFW Thumbs.db for GUI testing: ~100 distinct colored JPEG thumbnails
// with a classic 16-byte catalog (real filenames, FILETIME dates, UTF-16LE names, digit-reversed
// stream names). No personal data. Usage: node scripts/make-sample-thumbsdb.mjs [outPath] [count]

import { writeFile } from 'node:fs/promises'
import CFB from 'cfb'
import sharp from 'sharp'

const outPath = process.argv[2] || 'sample/Thumbs.db'
const count = Number(process.argv[3]) || 100

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
for (let i = 1; i <= count; i++) {
  const [w, h] = sizes[i % sizes.length]
  const name = i % 11 === 0 ? `${fancy[i % fancy.length]}_${i}.jpg` : `IMG_${String(i).padStart(4, '0')}.JPG`
  items.push({ index: i, name, date: new Date(base + i * 86400000 * 3), w, h })
}

const cfb = CFB.utils.cfb_new()
CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items))
for (const it of items) {
  const jpeg = await makeJpeg(it.index, it.w, it.h)
  CFB.utils.cfb_add(cfb, '/' + reverseDigits(it.index), jpeg)
}
const buf = Buffer.from(CFB.write(cfb, { type: 'buffer' }))

// Ensure the output dir exists, then write.
const { mkdir } = await import('node:fs/promises')
const { dirname } = await import('node:path')
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, buf)
console.log(`wrote ${outPath} — ${items.length} thumbnails, ${(buf.length / 1024).toFixed(0)} KB`)
