import test from 'node:test'
import assert from 'node:assert'
import { splitName } from './text.ts'

test('splitName: head + tail always reconstructs the label', () => {
  for (const label of ['photo.jpg', 'IMG_0123.jpg', 'archive.tar.gz', '.gitignore', 'name.', '12345.jpg', '', 'hash_no_ext', 'a1b2.png']) {
    const { head, tail } = splitName(label)
    assert.strictEqual(head + tail, label, `reconstruct ${JSON.stringify(label)}`)
  }
})

test('splitName: normal extension protects the ext', () => {
  assert.deepStrictEqual(splitName('photo.png'), { head: 'photo', tail: '.png' })
})

test('splitName: trailing digits stay with the extension (capped at 4)', () => {
  assert.deepStrictEqual(splitName('IMG_0123.jpg'), { head: 'IMG_', tail: '0123.jpg' })
  assert.deepStrictEqual(splitName('DSC_005123.jpg'), { head: 'DSC_00', tail: '5123.jpg' })
})

test('splitName: multi-dot uses only the last segment as ext', () => {
  assert.deepStrictEqual(splitName('archive.tar.gz'), { head: 'archive.tar', tail: '.gz' })
})

test('splitName: no real extension -> empty tail', () => {
  assert.deepStrictEqual(splitName('256_a1b2c3d4'), { head: '256_a1b2c3d4', tail: '' })
  assert.deepStrictEqual(splitName('.gitignore'), { head: '.gitignore', tail: '' })
  assert.deepStrictEqual(splitName('name.'), { head: 'name.', tail: '' })
  assert.deepStrictEqual(splitName(''), { head: '', tail: '' })
})

test('splitName: all-digit stem', () => {
  assert.deepStrictEqual(splitName('12345.jpg'), { head: '1', tail: '2345.jpg' })
})
