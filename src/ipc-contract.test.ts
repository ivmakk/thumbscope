// T2 - IPC contract wiring guard. The typed contract (src/shared/ipc.ts) plus tsgo already kill
// channel-name drift and payload-type drift. The one gap types can't see is "declared but not
// wired": a channel in CHANNELS that main never registers a handler for (or a handler removed
// without dropping the channel). This static check reads main as text and asserts the set of
// registered handler keys equals Object.keys(CHANNELS) - no Electron import, no app boot.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNELS } from './shared/ipc.ts'

const root = join(import.meta.dirname, '..')
const mainSrc = readFileSync(join(root, 'src/main/index.ts'), 'utf8')

test('every CHANNELS key is registered to an ipcMain.handle in main', () => {
  // Key-based (not literal-string): main references CHANNELS.<key>, so capturing the key survives
  // both the symbol indirection and any future channel-string rename.
  const registered = new Set<string>()
  for (const m of mainSrc.matchAll(/ipcMain\.handle\(\s*CHANNELS\.(\w+)/g)) {
    registered.add(m[1])
  }

  // Guard the parser itself: if the match shape ever changes (formatter, refactor) and captures
  // nothing, fail loudly here rather than passing on two empty sets.
  assert.ok(registered.size > 0, 'no ipcMain.handle(CHANNELS.*) registrations matched - check the regex')

  const declared = new Set(Object.keys(CHANNELS))
  assert.deepEqual(
    [...registered].sort(),
    [...declared].sort(),
    'CHANNELS and registered ipcMain.handle keys diverged (declared-but-not-wired or wired-but-not-declared)'
  )
})
