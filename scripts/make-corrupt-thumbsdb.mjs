// Generate a synthetic, SFW *corrupt* Thumbs.db to exercise the parser's recovery path: a normal
// classic Thumbs.db is built, then truncated (mimicking a half-downloaded / partly written file)
// so the OLE2 container is unreadable but raw JPEG bytes survive and can be carved.
// Usage: node scripts/make-corrupt-thumbsdb.mjs [outPath] [count]

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import CFB from 'cfb'
import sharp from 'sharp'

const outPath = process.argv[2] || 'sample/Thumbs-corrupt.db'
const count = Number(process.argv[3]) || 16

function hsv(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

async function makeJpeg(i, w, h) {
  const [r, g, b] = hsv((i * 47) % 360, 0.55, 0.9)
  const [r2, g2, b2] = hsv((i * 47 + 60) % 360, 0.7, 0.55)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgb(${r},${g},${b})"/>
      <stop offset="1" stop-color="rgb(${r2},${g2},${b2})"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="56%" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.4)}"
      font-weight="bold" fill="rgba(0,0,0,0.65)" text-anchor="middle">#${i}</text>
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

// Count complete JPEG runs (SOI..EOI) in a buffer — what the parser would recover.
function countCarvable(buf) {
  let n = 0
  let i = 0
  while (i + 2 < buf.length) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      let end = -1
      for (let j = i + 3; j + 1 < buf.length; j++) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) { end = j + 2; break }
      }
      if (end < 0) break
      n++
      i = end
    } else i++
  }
  return n
}

const sizes = [[256, 192], [200, 200], [192, 256], [240, 160]]
const items = []
const base = Date.UTC(2009, 5, 1)
for (let i = 1; i <= count; i++) {
  const [w, h] = sizes[i % sizes.length]
  items.push({ index: i, name: `IMG_${String(i).padStart(4, '0')}.JPG`, date: new Date(base + i * 86400000 * 5), w, h })
}

const cfb = CFB.utils.cfb_new()
CFB.utils.cfb_add(cfb, 'Catalog', buildCatalog(items))
for (const it of items) {
  CFB.utils.cfb_add(cfb, '/' + reverseDigits(it.index), await makeJpeg(it.index, it.w, it.h))
}
const full = Buffer.from(CFB.write(cfb, { type: 'buffer' }))

// Truncate to the first fraction that makes the container unreadable while still leaving carvable
// JPEGs (search a few cut points so the output is deterministic regardless of internal layout).
let corrupt = null
let recoverable = 0
for (const frac of [0.65, 0.55, 0.45, 0.75, 0.5, 0.6, 0.7, 0.4]) {
  const cut = full.subarray(0, Math.floor(full.length * frac))
  let unreadable = false
  try {
    CFB.read(cut, { type: 'buffer' })
  } catch {
    unreadable = true
  }
  const carvable = countCarvable(cut)
  if (unreadable && carvable > 0) {
    corrupt = cut
    recoverable = carvable
    break
  }
}

if (!corrupt) {
  // Fallback: smash the OLE2 signature so the reader rejects it; JPEG bytes stay intact.
  corrupt = Buffer.from(full)
  corrupt.fill(0, 0, 8)
  recoverable = countCarvable(corrupt)
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, corrupt)
console.log(`wrote ${outPath} — ${(corrupt.length / 1024).toFixed(0)} KB of a ${(full.length / 1024).toFixed(0)} KB file; ~${recoverable}/${count} thumbnails recoverable`)
