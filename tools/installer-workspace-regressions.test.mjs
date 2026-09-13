import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function makeExecutable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o755 })
  fs.chmodSync(file, 0o755)
}

test('installer builder accepts electron-builder hoisted to the workspace root', () => {
  if (process.platform === 'win32') return

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'icafe-builder-workspace-'))
  const scriptsDir = path.join(fixture, 'scripts')
  const appDir = path.join(fixture, 'apps', 'customer')
  const fakePath = path.join(fixture, 'fake-path')
  const commandLog = path.join(fixture, 'commands.log')

  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(appDir, { recursive: true })
  fs.mkdirSync(fakePath, { recursive: true })

  fs.copyFileSync(path.join(root, 'scripts', 'build-installer.mjs'), path.join(scriptsDir, 'build-installer.mjs'))
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'fixture-customer',
    version: '0.1.0',
    productName: 'Fixture Customer',
    build: { productName: 'Fixture Customer', directories: { output: 'installer' } }
  }, null, 2))

  makeExecutable(path.join(fakePath, 'npm'), `#!/bin/sh
printf 'npm %s\n' "$*" >> "${commandLog}"
case "$*" in
  *electron-builder*)
    mkdir -p "${path.join(appDir, 'installer')}"
    printf 'fixture installer' > "${path.join(appDir, 'installer', 'Fixture Customer Setup 0.1.0-x64.exe')}"
    ;;
esac
exit 0
`)

  const result = spawnSync(process.execPath, [path.join(scriptsDir, 'build-installer.mjs'), 'customer'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, npm_execpath: '', PATH: `${fakePath}${path.delimiter}${process.env.PATH || ''}` }
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const log = fs.readFileSync(commandLog, 'utf8')
  assert.match(log, /npm run build/)
  assert.match(log, /npm exec --yes=false -- electron-builder --win nsis --config/)
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'installer', 'latest.json'), 'utf8'))
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.file, 'Fixture Customer Setup 0.1.0-x64.exe')
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
})
