import { test } from 'node:test'
import assert from 'node:assert/strict'
import { targetDimensions, exportFilename, toCsv } from './export.ts'

test('targetDimensions: original mode never resizes', () => {
  assert.equal(targetDimensions(96, 64, 'original'), null)
  assert.equal(targetDimensions(2000, 2000, 'original'), null)
})

test('upscale800: enlarges smaller image, longer side -> 800, aspect preserved', () => {
  assert.deepEqual(targetDimensions(96, 64, 'upscale800'), { width: 800, height: 533 })
  assert.deepEqual(targetDimensions(64, 96, 'upscale800'), { width: 533, height: 800 })
  assert.deepEqual(targetDimensions(100, 100, 'upscale800'), { width: 800, height: 800 })
})

test('upscale800: leaves images already >= 800 untouched (never downscale)', () => {
  assert.equal(targetDimensions(800, 600, 'upscale800'), null)
  assert.equal(targetDimensions(1024, 768, 'upscale800'), null)
  assert.equal(targetDimensions(400, 900, 'upscale800'), null)
})

test('exportFilename: catalog name forced to .jpg', () => {
  const taken = new Set<string>()
  assert.equal(exportFilename({ name: 'DSC_5455.JPG', index: 1, streamName: '1' }, taken), 'DSC_5455.jpg')
  assert.equal(exportFilename({ name: 'photo.png', index: 2, streamName: '2' }, taken), 'photo.jpg')
})

test('exportFilename: falls back to item id then stream name', () => {
  const taken = new Set<string>()
  assert.equal(exportFilename({ name: null, index: 12, streamName: '21' }, taken), 'thumb_12.jpg')
  assert.equal(exportFilename({ name: null, index: null, streamName: '256_abc' }, taken), 'thumb_256_abc.jpg')
})

test('exportFilename: disambiguates collisions (case-insensitive)', () => {
  const taken = new Set<string>()
  assert.equal(exportFilename({ name: 'a.jpg', index: 1, streamName: '1' }, taken), 'a.jpg')
  assert.equal(exportFilename({ name: 'A.JPG', index: 2, streamName: '2' }, taken), 'A_1.jpg')
  assert.equal(exportFilename({ name: 'a.jpg', index: 3, streamName: '3' }, taken), 'a_2.jpg')
})

test('exportFilename: sanitizes illegal characters', () => {
  const taken = new Set<string>()
  assert.equal(exportFilename({ name: 'a/b:c?.jpg', index: 1, streamName: '1' }, taken), 'a_b_c_.jpg')
})

test('toCsv: header + rows, escapes commas/quotes', () => {
  const csv = toCsv([
    { id: 1, filename: 'a.jpg', size: 100, date: '2020-01-01T00:00:00.000Z', width: 96, height: 64 },
    { id: null, filename: 'b,"x".jpg', size: 200, date: null, width: null, height: null }
  ])
  const lines = csv.split('\r\n')
  assert.equal(lines[0], 'id,filename,size,date,width,height')
  assert.equal(lines[1], '1,a.jpg,100,2020-01-01T00:00:00.000Z,96,64')
  assert.equal(lines[2], ',"b,""x"".jpg",200,,,')
})
