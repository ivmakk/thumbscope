// GUI smoke driver — launches the built app over the Chrome DevTools Protocol, opens a db
// through the real shell-launch path (argv), reads back the parsed result, and screenshots
// the rendered grid. Useful for headless GUI checks (variant rendering, recovery banner)
// without a manual click-through. Requires a prior `npm run build` (loads from out/).
// Usage: node scripts/cdp-verify.mjs <db-path> <out-png>

import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = 9222
const db = resolve(process.argv[2])
const outPng = resolve(process.argv[3])
const root = resolve(import.meta.dirname, '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // port not up yet
    }
    await sleep(250)
  }
  throw new Error('CDP page target never appeared')
}

function cdp(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id
      pending.set(myId, { resolve, reject })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails) throw new Error(r.result?.description || 'eval threw')
  return r.result.value
}

const child = spawn(electronPath, ['.', db, `--remote-debugging-port=${PORT}`], {
  cwd: root,
  stdio: 'ignore',
})

let ws
try {
  const target = await getPageTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const send = cdp(ws)
  await send('Runtime.enable')
  await send('Page.enable')

  // Wait until the grid has painted thumbnails (virtualized — a few <img> is enough).
  let imgs = 0
  for (let i = 0; i < 40; i++) {
    imgs = await evaluate(send, `document.querySelectorAll('img').length`)
    if (imgs > 0) break
    await sleep(250)
  }

  // Authoritative data straight from the parser (independent of virtualization).
  const data = await evaluate(
    send,
    `(async () => {
       const r = await window.api.openPath(${JSON.stringify(db)})
       if (!r || r.error) return { error: r && r.error }
       return {
         count: r.count,
         failed: r.failed,
         recovered: r.recovered,
         sample: r.entries.slice(0, 3).map((e) => e.name),
       }
     })()`
  )

  const bodyText = await evaluate(send, `document.body.innerText`)
  const bannerShown = bodyText.includes('from a damaged file')

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(outPng, Buffer.from(shot.data, 'base64'))

  console.log(
    JSON.stringify(
      { db, imgsInDom: imgs, bannerShown, ...data, screenshot: outPng },
      null,
      2
    )
  )
} finally {
  try {
    ws?.close()
  } catch {}
  child.kill()
}
