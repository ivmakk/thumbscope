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

test('electron-builder.yml ships an arm64 mac dmg (only) with the icns icon and no update blockmap', () => {
  const yml = read('electron-builder.yml')
  assert.match(yml, /^mac:/m, 'no mac block')
  assert.match(yml, /icon:\s*build\/icon\.icns/)
  assert.match(yml, /public\.app-category\.utilities/)
  // dmg must be paired with arm64 (a loose `target:.../arch:...` substring check would pass even if
  // dmg were x64).
  assert.match(yml, /-\s*target:\s*dmg\s+arch:\s*arm64/)
  // No auto-update feed: the mac zip target and the NSIS differential blockmap are dropped so a
  // release carries only the two installers (see release.yml's selective upload).
  assert.doesNotMatch(yml, /target:\s*zip/)
  assert.match(yml, /differentialPackage:\s*false/)
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
  // Gating keys off the EVENT TYPE, not just the ref: a workflow_dispatch run targeting a tag ref
  // must not publish. Draft only on tag pushes; manual dispatch only uploads artifacts.
  assert.match(wf, /if:\s*github\.event_name == 'push' && startsWith\(github\.ref,\s*'refs\/tags\/'\)/)
  // electron-builder never publishes; we upload only the installer explicitly, per platform, so no
  // update-feed metadata (latest*.yml, blockmaps, mac zip) reaches the release.
  assert.match(wf, /electron-builder --\$\{\{ matrix\.platform \}\} --publish never/)
  assert.doesNotMatch(wf, /--publish always/)
  assert.match(wf, /gh release upload "\$GITHUB_REF_NAME" release\/\*-setup\.exe --clobber/)
  assert.match(wf, /gh release upload "\$GITHUB_REF_NAME" release\/\*-arm64\.dmg --clobber/)
  // The upload step must be gated on the push event, so a workflow_dispatch (manual) run - whose
  // GITHUB_REF_NAME is a branch, not a tag with a draft release - never runs `gh release upload`.
  assert.match(wf, /if:\s*\$\{\{\s*github\.event_name == 'push'\s*\}\}/)
  assert.match(wf, /if:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch'\s*\}\}/)
})
