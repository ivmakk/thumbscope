// Static guards for the cross-platform packaging config. These do NOT build anything — they assert
// the macOS (and Windows) packaging wiring stays intact, so an accidental edit that drops the mac
// target, the dist:mac script, the CLI wrapper, or the CI signing-skip fails fast. The actual
// .dmg / .app is validated by building (npm run dist:mac) — an integration step, not a unit test.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('package.json has a dist:mac script that builds the app + CLI via electron-builder', () => {
  const pkg = JSON.parse(read('package.json'))
  const dist = pkg.scripts?.['dist:mac']
  assert.ok(dist, 'dist:mac script is missing')
  assert.match(dist, /electron-vite build/)
  assert.match(dist, /build:cli/)
  assert.match(dist, /electron-builder --mac/)
})

test('electron-builder.yml ships an arm64 mac target (dmg + zip) with the icns icon', () => {
  const yml = read('electron-builder.yml')
  assert.match(yml, /^mac:/m, 'no mac block')
  assert.match(yml, /icon:\s*build\/icon\.icns/)
  assert.match(yml, /public\.app-category\.utilities/)
  // Each target must be paired with arm64 (loose `target:.../arch:...` substring checks would pass
  // even if dmg were x64 and only zip arm64).
  assert.match(yml, /-\s*target:\s*dmg\s+arch:\s*arm64/)
  assert.match(yml, /-\s*target:\s*zip\s+arch:\s*arm64/)
})

test('electron-builder.yml ships both the CLI payload and the POSIX wrapper into Resources/cli', () => {
  const yml = read('electron-builder.yml')
  // The CLI bundle itself (out/cli/thumbscope.cjs -> Resources/cli) — the wrapper execs this.
  assert.match(yml, /from:\s*out\/cli/)
  // The launcher. Both live at the TOP-LEVEL extraResources so they ship on mac regardless of
  // electron-builder's platform-vs-top-level merge semantics (a mac-only block could shadow the
  // payload, leaving the wrapper to exec a missing thumbscope.cjs).
  assert.match(yml, /from:\s*build\/thumbscope/)
  assert.match(yml, /to:\s*cli\/thumbscope/)
})

test('build/thumbscope wrapper is executable and runs the bundled CLI via Electron-as-Node', () => {
  const path = 'build/thumbscope'
  // Node's stat().mode doesn't reflect POSIX exec bits on win32, and a Windows git checkout may
  // not preserve them — only assert the bit where it's meaningful. CI runs on Linux.
  if (process.platform !== 'win32') {
    const mode = statSync(join(root, path)).mode
    assert.notEqual(mode & 0o111, 0, 'wrapper is not executable (lost +x bit)')
  }
  const sh = read(path)
  assert.match(sh, /^#!\/bin\/sh/)
  assert.match(sh, /ELECTRON_RUN_AS_NODE=1/)
  assert.match(sh, /NODE_PATH=.*app\.asar\.unpacked\/node_modules/)
  assert.match(sh, /cli\/thumbscope\.cjs/)
})

test('release workflow builds both platforms and skips mac signing', () => {
  const wf = read('.github/workflows/release.yml')
  assert.match(wf, /windows-latest/)
  assert.match(wf, /macos-latest/)
  assert.match(wf, /CSC_IDENTITY_AUTO_DISCOVERY:\s*false/)
  // draft release is created only for tag pushes (its own gated job)
  assert.match(wf, /if:\s*startsWith\(github\.ref,\s*'refs\/tags\/'\)/)
})
