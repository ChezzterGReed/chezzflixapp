#!/usr/bin/env node
// Runs JavaScript inside the Chezzflix WebView on a connected Android device/emulator (debug builds) and prints the result.
// Usage: node scripts/android-eval.mjs "<js expression>" [package=app.chezzflix.client.debug]
import { execSync } from 'node:child_process'
const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
const [expr, pkg = 'app.chezzflix.client.debug'] = process.argv.slice(2)
const pid = execSync(`${ADB} shell pidof ${pkg}`).toString().trim().split(/\s+/)[0]
if (!pid) { console.error('app is not running'); process.exit(1) }
const sockets = execSync(`${ADB} shell cat /proc/net/unix`).toString().split('\n').filter((l) => l.includes(`webview_devtools_remote_${pid}`))
if (!sockets.length) { console.error('no devtools socket (is this a debug build?)'); process.exit(1) }
execSync(`${ADB} forward tcp:9341 localabstract:webview_devtools_remote_${pid}`)
const targets = await (await fetch('http://localhost:9341/json')).json()
const page = targets.find((t) => t.type === 'page') ?? targets[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
const res = await new Promise((resolve) => {
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result) }
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
})
console.log(res.exceptionDetails ? 'ERROR: ' + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails) : JSON.stringify(res.result.value))
ws.close(); process.exit(0)
