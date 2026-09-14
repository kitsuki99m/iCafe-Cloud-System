import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read=(file)=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Alt+Shift+W emergency quit is local-master-PIN-only and bypasses Café Edge validation',()=>{
  const guard=read('apps/customer/src/components/common/EmergencyControlGuard.jsx')
  const start=guard.indexOf('async function confirm()')
  const end=guard.indexOf('return (', start)
  const confirm=guard.slice(start,end)
  assert.match(confirm,/verifyStationSetupMasterPin/)
  assert.match(confirm,/if \(command === 'quit'\) \{[\s\S]*await executeLocally\(\)[\s\S]*return/)
  const quitIndex=confirm.indexOf("if (command === 'quit')")
  const edgeIndex=confirm.indexOf("apiPost('/public/station-control'")
  assert.ok(quitIndex >= 0 && edgeIndex > quitIndex, 'quit must short-circuit before Café Edge authorization')
})

test('Electron emergency quit does not broadcast a renderer lifecycle request or wait on network reconciliation',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const start=main.indexOf('async function executeEmergencyCommand')
  const end=main.indexOf('function createWindow()', start)
  const emergency=main.slice(start,end)
  assert.match(emergency,/markSessionExit\(\{reason:'app_exit'\}\)/)
  assert.match(emergency,/setImmediate\(\(\) => app\.quit\(\)\)/)
  assert.doesNotMatch(emergency,/station:app-exit-requested/)
  assert.doesNotMatch(emergency,/apiPost|station-control|setTimeout\([^\n]*3000/)
})
