// Generate the platform icon set from the single SVG master (build/icon.svg).
// sharp rasterizes the SVG to a 1024px PNG (high density = crisp small frames), which feeds
// png2icons for build/icon.ico (multi-res Windows) + build/icon.icns (macOS); a 256px favicon
// (src/renderer/icon.png) is rendered straight from the SVG. electron-builder picks up
// build/icon.* by buildResources; the exe-embedded icon flows to shortcuts/context-menu/ARP.

import { readFile, writeFile } from 'node:fs/promises'
import png2icons from 'png2icons'
import sharp from 'sharp'

const svg = await readFile('build/icon.svg')

// High density so the vector is sampled well above the target raster size.
const master = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer()
await writeFile('build/icon.png', master)

const ico = png2icons.createICO(master, png2icons.BICUBIC, 0, false)
await writeFile('build/icon.ico', ico)

const icns = png2icons.createICNS(master, png2icons.BICUBIC, 0)
await writeFile('build/icon.icns', icns)

// Favicon for the dev/renderer window tab.
await sharp(svg, { density: 256 }).resize(256, 256).png().toFile('src/renderer/icon.png')

console.log('built build/icon.png, build/icon.ico, build/icon.icns, src/renderer/icon.png')
