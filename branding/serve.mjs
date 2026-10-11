// Tiny local server for the icon generator: serves generate.html + face.png, and saves PNGs the page posts to branding/out/.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (req.method === 'POST' && u.pathname === '/save') {
    const name = path.normalize(u.searchParams.get('name') ?? '').replace(/^(\.\.[/\\])+/, '')
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { const f = path.join(dir, 'out', name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks)); res.end('ok') })
    return
  }
  const f = u.pathname === '/' ? 'generate.html' : u.pathname.slice(1)
  const full = path.join(dir, f)
  if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('nope') }
  res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream')
  fs.createReadStream(full).pipe(res)
}).listen(8123, () => console.log('http://localhost:8123'))
