import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const appName = process.argv[2]
if (!['admin', 'customer'].includes(appName)) throw new Error('Usage: node scripts/build-installer.mjs admin|customer')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(repoRoot, 'apps', appName)
const packagePath = path.join(appDir, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const requestedName = String(process.env.CAFE_NAME || '').trim()
const productName = requestedName || packageJson.build?.productName || packageJson.productName || packageJson.name
const configPath = path.join(appDir, '.electron-builder.generated.json')
const artifactName = `${productName} Setup \${version}-\${arch}.\${ext}`
const config = { ...packageJson.build, productName, artifactName }

function run(command, args, cwd = appDir) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 1}`)
}

function npmInvocation(args) {
  const npmExecPath = String(process.env.npm_execpath || '').trim()
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args] }
  }

  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe'
    const quote = (value) => {
      const text = String(value)
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    return {
      command: shell,
      args: ['/d', '/s', '/c', `npm ${args.map(quote).join(' ')}`],
    }
  }

  return { command: 'npm', args }
}

function runNpm(args, cwd = appDir) {
  const invocation = npmInvocation(args)
  run(invocation.command, invocation.args, cwd)
}

let backendRebuilt = false
try {
  if (process.platform === 'win32') {
    runNpm(['run', appName === 'admin' ? 'kill:admin' : 'kill:customer'])
    runNpm(['run', 'kill:electron'])
    runNpm(['run', 'wait:release'])
  }
  fs.rmSync(path.join(appDir, 'installer'), { recursive: true, force: true })

  if (process.platform === 'win32' && appName === 'admin') {
    runNpm(['run', 'rebuild:backend'])
    backendRebuilt = true
  }

  // Never package whatever happens to be in dist/. Produce a fresh renderer build.
  runNpm(['run', 'build'])
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  runNpm(['exec', '--yes=false', '--', 'electron-builder', '--win', 'nsis', '--config', configPath])

  if (appName === 'customer') {
    const installerDir = path.join(appDir, 'installer')
    const installerFile = fs.readdirSync(installerDir).find((name) => /\.exe$/i.test(name) && /setup/i.test(name))
    if (!installerFile) throw new Error('Customer installer EXE was not found; update manifest was not generated.')
    const installerPath = path.join(installerDir, installerFile)
    const bytes = fs.readFileSync(installerPath)
    const manifest = {
      schema: 1,
      channel: String(process.env.AEZAKMI_UPDATE_CHANNEL || 'stable'),
      version: String(packageJson.version),
      publishedAt: new Date().toISOString(),
      file: installerFile,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
      releaseNotes: String(process.env.AEZAKMI_RELEASE_NOTES || '').trim(),
    }
    fs.writeFileSync(path.join(installerDir, 'latest.json'), JSON.stringify(manifest, null, 2))
    console.log(`Customer update manifest: ${path.join(installerDir, 'latest.json')}`)
  }
} finally {
  try { fs.unlinkSync(configPath) } catch {}
  if (backendRebuilt) {
    runNpm(['run', 'restore:backend'])
  }
}
