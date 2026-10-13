// A stand-in for plex.tv, for testing the Worker locally: tokens look like "tok-<name>"; "tok-outsider" has no servers.
import http from 'node:http'
http.createServer((req, res) => {
  const tok = req.headers['x-plex-token'] ?? ''
  const name = String(tok).replace(/^tok-/, '')
  res.setHeader('Content-Type', 'application/json')
  if (!String(tok).startsWith('tok-')) { res.statusCode = 401; return res.end('{}') }
  if (req.url.startsWith('/api/v2/user')) return res.end(JSON.stringify({ uuid: `u-${name}`, id: 1 }))
  if (req.url.startsWith('/api/v2/resources')) return res.end(JSON.stringify(name === 'outsider' ? [] : [{ clientIdentifier: 'srv1', provides: 'server' }]))
  res.statusCode = 404; res.end('{}')
}).listen(8788, () => console.log('fake plex on 8788'))
