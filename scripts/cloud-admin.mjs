import { spawn } from 'node:child_process'
import fs from 'node:fs'

const command = process.argv[2] || 'dev'
if (!['dev', 'build', 'preview'].includes(command)) {
  console.error('Usage: node scripts/cloud-admin.mjs <dev|build|preview>')
  process.exit(2)
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, 'utf8')
  const envVars = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    envVars[key] = val
  }
  return envVars
}

const workspaceArgs = ['--workspace', 'apps/admin', 'run', command]
const rootEnv = loadEnvFile('.env')
const adminEnv = loadEnvFile('apps/admin/.env')
const env = { ...rootEnv, ...adminEnv, ...process.env, VITE_ADMIN_MODE: 'cloud' }

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

const invocation = npmInvocation(workspaceArgs)
const child = spawn(invocation.command, invocation.args, {
  stdio: 'inherit',
  env,
})

child.on('error', (error) => {
  console.error(`Failed to launch npm for the cloud admin ${command}:`, error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
