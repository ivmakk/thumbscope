import test from 'node:test'
import assert from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isSqlite, parsePhotothumb, UNSUPPORTED_SQLITE_MESSAGE } from './photothumb.ts'
import { TINY_JPEG } from './fixture.ts'
import { friendlyError } from '../renderer/src/lib/errors.ts'

// Write a throwaway SQLite db to a temp path and return it. node:sqlite opens a path, not a buffer,
// so the fixture is a real file the test cleans up. `setup` customizes schema/rows per case.
function withDb(setup: (db: DatabaseSync) => void, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'thumbscope-sqlite-'))
  const path = join(dir, 'photothumb.db')
  const db = new DatabaseSync(path)
  try {
    setup(db)
  } finally {
    db.close()
  }
  try {
    fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// A PhotoScape-shaped thumb table with two valid JPEG rows + one row whose blob isn't a JPEG.
function seedPhotothumb(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE thumb(fname text primary key, tcreate int, tmodify int, fsize int, width int, height int, image blob)'
  )
  const ins = db.prepare(
    'INSERT INTO thumb(fname, tcreate, tmodify, fsize, width, height, image) VALUES (?,?,?,?,?,?,?)'
  )
  ins.run('DSC0001.JPG', 1383928992, 1376331282, 3820905, 3240, 4320, TINY_JPEG)
  ins.run('DSC0002.JPG', 1383928958, 1376331286, 3878665, 3240, 4320, TINY_JPEG)
  ins.run('BROKEN.JPG', 0, 0, 0, 0, 0, Buffer.from('not a jpeg'))
}

test('isSqlite detects the SQLite magic and rejects other buffers', () => {
  assert.strictEqual(isSqlite(Buffer.from('SQLite format 3\0extra', 'latin1')), true)
  assert.strictEqual(isSqlite(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), false) // OLE2
  assert.strictEqual(isSqlite(Buffer.alloc(4)), false) // too short
})

test('parses a PhotoScape photothumb.db: names, dims, dates from the table', () => {
  withDb(seedPhotothumb, (path) => {
    const r = parsePhotothumb(path)
    assert.strictEqual(r.count, 2) // BROKEN.JPG skipped
    assert.strictEqual(r.failed, 1)
    assert.strictEqual(r.recovered, false)
    const e = r.entries.find((x) => x.streamName === 'DSC0001.JPG')
    assert.ok(e, 'entry present keyed by fname')
    assert.strictEqual(e!.name, 'DSC0001.JPG')
    assert.strictEqual(e!.label, 'DSC0001.JPG')
    assert.strictEqual(e!.payload.kind, 'jpeg')
    assert.strictEqual(e!.width, 1) // TINY_JPEG is 1x1 — the thumbnail's own SOF dims, not the 3240x4320 column
    assert.strictEqual(e!.height, 1)
    assert.strictEqual(e!.date?.toISOString(), new Date(1376331282 * 1000).toISOString()) // tmodify, unix seconds
  })
})

test('throws a clear error when the SQLite db has no thumb table', () => {
  withDb(
    (db) => db.exec('CREATE TABLE other(x int)'),
    (path) => assert.throws(() => parsePhotothumb(path), new RegExp(UNSUPPORTED_SQLITE_MESSAGE.slice(0, 20)))
  )
})

// Contract: the message parsePhotothumb throws must keep mapping to the SQLite headline in the renderer.
// friendlyError keys off the "SQLite database" substring, so editing UNSUPPORTED_SQLITE_MESSAGE to drop
// it silently regresses the GUI to the generic fallback — assert the real message end-to-end here, at the
// fast node --test tier, rather than relying only on the slow e2e spec to catch drift.
test('the unsupported-SQLite message maps to the SQLite headline, not the generic fallback', () => {
  assert.strictEqual(friendlyError(UNSUPPORTED_SQLITE_MESSAGE), 'SQLite database - not a thumbnail cache Thumbscope can read.')
})

test('throws a clear error when the thumb table is missing expected columns', () => {
  withDb(
    (db) => db.exec('CREATE TABLE thumb(fname text, junk int)'),
    (path) => assert.throws(() => parsePhotothumb(path), /photothumb\.db/)
  )
})

test('synthesizes unique stream names for NULL / duplicate fname', () => {
  withDb(
    (db) => {
      // A non-PK table so fname can be NULL and repeat — exercises the Map-key uniqueness guard.
      db.exec('CREATE TABLE thumb(fname text, tcreate int, tmodify int, fsize int, width int, height int, image blob)')
      const ins = db.prepare('INSERT INTO thumb(fname, tmodify, image) VALUES (?,?,?)')
      ins.run(null, 100, TINY_JPEG) // missing name
      ins.run('DUP.JPG', 200, TINY_JPEG) // duplicate name pair
      ins.run('DUP.JPG', 300, TINY_JPEG)
    },
    (path) => {
      const r = parsePhotothumb(path)
      assert.strictEqual(r.count, 3)
      const names = r.entries.map((e) => e.streamName)
      assert.strictEqual(new Set(names).size, 3, 'all stream names unique (no Map collisions)')
      assert.ok(r.entries.some((e) => e.name === null), 'NULL fname surfaces as name=null')
    }
  )
})

test('tmodify === 0 yields the Unix epoch, not a missing date', () => {
  withDb(
    (db) => {
      db.exec('CREATE TABLE thumb(fname text primary key, tcreate int, tmodify int, fsize int, width int, height int, image blob)')
      db.prepare('INSERT INTO thumb(fname, tmodify, image) VALUES (?,?,?)').run('EPOCH.JPG', 0, TINY_JPEG)
    },
    (path) => {
      const e = parsePhotothumb(path).entries[0]
      assert.strictEqual(e.date?.toISOString(), new Date(0).toISOString())
    }
  )
})
