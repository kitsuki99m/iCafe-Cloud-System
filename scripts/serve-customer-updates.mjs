import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const updateDir = path.join(repoRoot, 'apps', 'customer', 'installer')
const host = String(process.env.AEZAKMI_UPDATE_HOST || '0.0.0.0')
const port = Math.max(1, Math.min(65535, Number(process.env.AEZAKMI_UPDATE_PORT || 8787) || 8787))

function manifest() {
  const file = path.join(updateDir, 'latest.json')
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function send(res, status, body, type = 'text/plain; charset=utf-8', cache = 'no-store') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')
  let pathname = '/'
  try { pathname = decodeURIComponent(new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname) } catch {}
  const info = manifest()
  if (pathname === '/' || pathname === '/health') return send(res, 200, JSON.stringify({ ok:true, updateDir, version:info?.version || null }), 'application/json; charset=utf-8')
  if (pathname === '/latest.json') {
    const file = path.join(updateDir, 'latest.json')
    if (!fs.existsSync(file)) return send(res, 404, 'Build the Customer installer first; latest.json is missing.')
    const body = fs.readFileSync(file)
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':body.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' })
    return req.method === 'HEAD' ? res.end() : res.end(body)
  }
  const requested = path.basename(pathname)
  const allowed = info?.file && requested === path.basename(String(info.file))
  if (!allowed) return send(res, 404, 'Not found')
  const file = path.join(updateDir, requested)
  if (!fs.existsSync(file)) return send(res, 404, 'Installer not found')
  const stat = fs.statSync(file)
  res.writeHead(200, { 'Content-Type':'application/vnd.microsoft.portable-executable', 'Content-Length':stat.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
})

server.listen(port, host, () => {
  console.log(`Aezakmi Customer update server: http://${host}:${port}/latest.json`)
  console.log(`Serving: ${updateDir}`)
  console.log('LAN HTTP is intended for a trusted café network/test channel. Prefer HTTPS for internet-facing production updates.')
})
