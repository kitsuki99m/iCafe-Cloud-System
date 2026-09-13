import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('healthy member session lifecycle marker is not treated as pending interruption recovery',()=>{
  const lifecycle=read('apps/customer/src/lib/sessionLifecycle.js')
  assert.match(lifecycle,/function hasActiveStationLifecycle\(\)[\s\S]*stationLifecycleMarker\(\)\?\.active/)
  assert.match(lifecycle,/function hasPendingStationLifecycle\(\)[\s\S]*marker\?\.active && marker\?\.recoveryRequired/)
  assert.match(lifecycle,/recoverPendingStationLifecycle\(\)[\s\S]*!marker\?\.active \|\| !marker\?\.recoveryRequired/)
})

test('Electron lifecycle marker distinguishes current healthy runtime from crash or explicit exit recovery',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.match(main,/const lifecycleRuntimeId = crypto\.randomUUID\(\)/)
  assert.match(main,/runtimeInstanceId:lifecycleRuntimeId/)
  assert.match(main,/recoveryRequired=Boolean\(marker\.active && \(marker\.exitRequestedAt \|\| !owner \|\| owner!==lifecycleRuntimeId\)\)/)
  assert.match(main,/event\.returnValue=lifecycleMarkerForRenderer\(\)/)
})

test('member Start Session does not fabricate an active session before backend confirmation',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const start=data.slice(data.indexOf('function startSelfServiceSession'),data.indexOf('function requestSessionExtension'))
  assert.ok(start.includes("apiPost('/sessions/start'"))
  assert.doesNotMatch(start,/pendingSession|id:`pending:/)
  assert.doesNotMatch(start,/optimisticState\(/)
})

test('real transport or auth interruption still checkpoints an actually active paid session',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(data,/hasActiveStationLifecycle\(\)[\s\S]*releaseStationLifecycle\('station_disconnect'/)
  assert.match(auth,/hasActiveStationLifecycle\(\)\) releaseStationLifecycle\("auth_invalid"/)
})
