// IPC contract wiring guard. The typed contract (src/shared/ipc.ts) plus tsgo already kill
// channel-name drift and payload-type drift. The one gap types can't see is "declared but not
// wired": a channel constant that nothing actually registers/sends/subscribes (or a registration
// removed without dropping the channel). This static check reads main + preload as text and
// asserts each constant set is fully wired - no Electron import, no app boot.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNELS, PUSH } from './shared/ipc.ts'

const root = join(import.meta.dirname, '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf8')
const mainSrc = read('src/main/index.ts')
const preloadSrc = read('src/preload/index.ts')

// Collect the constant keys referenced by a given call shape, e.g. `ipcMain.handle(CHANNELS.openFile`.
// Key-based (not literal-string): both sides reference CONST.<key>, so capturing the key survives the
// symbol indirection and any future channel-string rename.
function referencedKeys(src: string, callPattern: RegExp): Set<string> {
  const keys = new Set<string>()
  for (const m of src.matchAll(callPattern)) keys.add(m[1])
  return keys
}

test('every CHANNELS key is registered to an ipcMain.handle in main', () => {
  const registered = referencedKeys(mainSrc, /ipcMain\.handle\(\s*CHANNELS\.(\w+)/g)
  // Guard the parser itself: if the match shape ever changes (formatter, refactor) and captures
  // nothing, fail loudly here rather than passing on two empty sets.
  assert.ok(registered.size > 0, 'no ipcMain.handle(CHANNELS.*) registrations matched - check the regex')
  assert.deepEqual(
    [...registered].sort(),
    Object.keys(CHANNELS).sort(),
    'CHANNELS and registered ipcMain.handle keys diverged (declared-but-not-wired or wired-but-not-declared)'
  )
})

test('every PUSH key is both sent from main and subscribed in preload', () => {
  // Push channels are one-way main -> renderer: main calls `<x>.send(PUSH.key, ...)`, preload
  // listens with `ipcRenderer.on(PUSH.key, ...)`. A PUSH constant wired on only one side (or neither)
  // is a silently-dead channel - the same declared-but-not-wired gap, for the half of the IPC surface
  // the handle/invoke check above can't see.
  const sent = referencedKeys(mainSrc, /\.send\(\s*PUSH\.(\w+)/g)
  const subscribed = referencedKeys(preloadSrc, /ipcRenderer\.on\(\s*PUSH\.(\w+)/g)
  assert.ok(sent.size > 0 && subscribed.size > 0, 'no PUSH send/on references matched - check the regex')

  const declared = Object.keys(PUSH).sort()
  assert.deepEqual([...sent].sort(), declared, 'PUSH channels not all sent from main')
  assert.deepEqual([...subscribed].sort(), declared, 'PUSH channels not all subscribed in preload')
})
