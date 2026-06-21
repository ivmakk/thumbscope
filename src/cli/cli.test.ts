import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildThumbsDb } from '../core/fixture.ts'
import { cmdExport, cmdList } from './commands.ts'

const tmp = (): Promise<string> => mkdtemp(join(tmpdir(), 'tdbcli-'))

// Run fn with process.stderr captured (so exit-code + summary lines can be asserted without spawning).
async function capture(fn: () => Promise<number>): Promise<{ code: number; err: string }> {
  const errs: string[] = []
  const orig = process.stderr.write.bind(process.stderr)
  // @ts-expect-error narrow override is fine for the test
  process.stderr.write = (s: string): boolean => (errs.push(String(s)), true)
  try {
    return { code: await fn(), err: errs.join('') }
  } finally {
    process.stderr.write = orig
  }
}

test('cmdExport: one .jpg per thumbnail + csv, valid JPEG bytes', async () => {
  const dir = await tmp()
  const db = join(dir, 'Thumbs.db')
  await writeFile(db, buildThumbsDb())
  const out = join(dir, 'out')

  const { code, err } = await capture(() =>
    cmdExport(db, { out, mode: 'original', quality: '80', csv: true, overwrite: false })
  )
  assert.equal(code, 0)
  assert.match(err, /3 exported \/ 0 failed \/ 0 skipped/)

  const files = await readdir(out)
  const jpgs = files.filter((f) => f.endsWith('.jpg'))
  assert.equal(jpgs.length, 3)
  assert.ok(files.includes('thumbnails.csv'))
  const first = await readFile(join(out, jpgs[0]))
  assert.deepEqual([...first.subarray(0, 3)], [0xff, 0xd8, 0xff])

  await rm(dir, { recursive: true, force: true })
})

test('cmdExport: skips existing by default, --overwrite rewrites', async () => {
  const dir = await tmp()
  const db = join(dir, 'Thumbs.db')
  await writeFile(db, buildThumbsDb())
  const out = join(dir, 'out')

  await capture(() => cmdExport(db, { out, mode: 'original', quality: '80', csv: false, overwrite: false }))

  const second = await capture(() =>
    cmdExport(db, { out, mode: 'original', quality: '80', csv: false, overwrite: false })
  )
  assert.equal(second.code, 0)
  assert.match(second.err, /0 exported \/ 0 failed \/ 3 skipped/)

  const third = await capture(() =>
    cmdExport(db, { out, mode: 'original', quality: '80', csv: false, overwrite: true })
  )
  assert.match(third.err, /3 exported \/ 0 failed \/ 0 skipped/)

  await rm(dir, { recursive: true, force: true })
})

test('cmdExport: --filter narrows the set', async () => {
  const dir = await tmp()
  const db = join(dir, 'Thumbs.db')
  await writeFile(db, buildThumbsDb()) // names IMG001.JPG, фото.jpg, DSC012.JPG
  const out = join(dir, 'out')

  const { code, err } = await capture(() =>
    cmdExport(db, { out, mode: 'original', quality: '80', csv: false, overwrite: false, filter: 'dsc' })
  )
  assert.equal(code, 0)
  assert.match(err, /1 exported/)
  assert.equal((await readdir(out)).length, 1)

  await rm(dir, { recursive: true, force: true })
})

test('cmdExport: invalid --mode / --quality exit 2', async () => {
  const dir = await tmp()
  const db = join(dir, 'Thumbs.db')
  await writeFile(db, buildThumbsDb())
  const badMode = await capture(() => cmdExport(db, { mode: 'huge', quality: '80', csv: false, overwrite: false }))
  const badQ = await capture(() => cmdExport(db, { mode: 'original', quality: '999', csv: false, overwrite: false }))
  assert.equal(badMode.code, 2)
  assert.equal(badQ.code, 2)
  await rm(dir, { recursive: true, force: true })
})

test('cmdExport: non-CFB input exits 1, no crash', async () => {
  const dir = await tmp()
  const bad = join(dir, 'Thumbs.db')
  await writeFile(bad, Buffer.alloc(2048))
  const { code, err } = await capture(() =>
    cmdExport(bad, { out: join(dir, 'o'), mode: 'original', quality: '80', csv: false, overwrite: false })
  )
  assert.equal(code, 1)
  assert.ok(err.length > 0)
  await rm(dir, { recursive: true, force: true })
})

test('cmdList --csv writes header + one row per thumbnail; accepts a folder', async () => {
  const dir = await tmp()
  await writeFile(join(dir, 'Thumbs.db'), buildThumbsDb())
  const csv = join(dir, 'meta.csv')

  const { code } = await capture(() => cmdList(dir, { csv })) // pass the folder, not the file
  assert.equal(code, 0)
  const lines = (await readFile(csv, 'utf8')).trim().split('\r\n')
  assert.equal(lines[0], 'id,filename,size,date,width,height')
  assert.equal(lines.length, 4) // header + 3

  await rm(dir, { recursive: true, force: true })
})

test('cmdList table: prints a header row, then one row per thumbnail', async () => {
  const dir = await tmp()
  await writeFile(join(dir, 'Thumbs.db'), buildThumbsDb())

  const out: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  // @ts-expect-error narrow override is fine for the test
  process.stdout.write = (s: string): boolean => (out.push(String(s)), true)
  let code: number
  try {
    code = await capture(() => cmdList(dir, {})).then((r) => r.code)
  } finally {
    process.stdout.write = orig
  }
  assert.equal(code, 0)
  const lines = out.join('').trimEnd().split('\n')
  assert.match(lines[0], /^#\s+NAME\s+SIZE\s+DATE\s+DIMS$/)
  assert.equal(lines.length, 4) // header + 3 rows

  await rm(dir, { recursive: true, force: true })
})

test('CLI binary: list exits 0, missing db exits non-zero', async () => {
  const dir = await tmp()
  const db = join(dir, 'Thumbs.db')
  await writeFile(db, buildThumbsDb())
  const cli = fileURLToPath(new URL('./index.ts', import.meta.url))

  const ok = spawnSync(process.execPath, [cli, 'list', db], { encoding: 'utf8' })
  assert.equal(ok.status, 0)

  const missing = spawnSync(process.execPath, [cli, 'export', join(dir, 'nope.db')], { encoding: 'utf8' })
  assert.notEqual(missing.status, 0)

  await rm(dir, { recursive: true, force: true })
})
