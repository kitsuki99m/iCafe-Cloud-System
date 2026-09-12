import 'dotenv/config'

// `npm start` is the local/LAN source-server entry point. If the operator did
// not provide NODE_ENV, use development-safe defaults so the backend actually
// binds to 0.0.0.0:3000 without requiring a hand-created .env file.
// The packaged Admin app bypasses this wrapper and launches src/server.js with
// NODE_ENV=production plus its generated JWT secret/CORS configuration.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development'
  console.log('[backend] NODE_ENV not set; using development defaults for manual npm start.')
}

await import('../src/server.js')
