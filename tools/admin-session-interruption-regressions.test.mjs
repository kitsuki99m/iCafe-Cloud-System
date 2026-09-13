import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=process.cwd()
const read=(file)=>readFileSync(resolve(root,file),'utf8')

test('Café Edge checkpoints blocking Admin commands before dispatch and immediately releases power-interrupted sessions',()=>{
  const ops=read('backend/src/routes/operationsRoutes.js')
  assert.match(ops,/interruptForQueuedCommand/)
  assert.match(ops,/command\.command === 'lock'[\s\S]*pauseActiveSession/)
  assert.match(ops,/command\.command === 'reboot' \|\| command\.command === 'shutdown'[\s\S]*releaseStationSession/)
  assert.match(ops,/UPDATE auth_sessions SET revoked_at=COALESCE/)
  assert.match(ops,/return interruptForQueuedCommand\(queuedCommand,requestedAt\)[\s\S]*emitToRoom\(`pc:\$\{pcId\}`,'remote:command'/)
  assert.match(ops,/remote:command'[\s\S]*auth:revoked/)
  assert.doesNotMatch(ops,/applyCompletedCommand\(command\)[\s\S]{0,220}pauseActiveSession/)
})

test('pauseActiveSession durably checkpoints prepaid remainder and postpaid accrued amount',()=>{
  const util=read('backend/src/utils/sessionTime.js')
  const pause=util.slice(util.indexOf('export function pauseActiveSession'),util.indexOf('export function resumeActiveSession'))
  assert.match(pause,/remainingSecondsForSession/)
  assert.match(pause,/elapsedBillableSeconds/)
  assert.match(pause,/saved_remaining_seconds=\?,unsettled_amount_due=\?/)
  assert.match(pause,/UPDATE members SET session_seconds_remaining=\?,updated_at=\?/) 
  assert.match(util,/resumeActiveSession[\s\S]*saved_remaining_seconds=NULL,unsettled_amount_due=NULL/)
})

test('Cloud Admin pauses at command issue time and power commands release/revoke before station broadcast',()=>{
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(fn,/checkpointAdminInterruption/)
  assert.match(fn,/aezakmi_station_pause_session/)
  assert.match(fn,/aezakmi_station_release_session/)
  assert.match(fn,/branch_customer_auth_sessions'[\s\S]*revoked_at:now/)
  const checkpoint=fn.indexOf('checkpointAdminInterruption(admin,branchId,stationId,device.id')
  const broadcast=fn.indexOf('await broadcast(device.realtime_topic_key',checkpoint)
  assert.ok(checkpoint>0&&broadcast>checkpoint,'session checkpoint must happen before station broadcast')
})

test('Cloud pause checkpoint persists locked timer state for prepaid and postpaid sessions',()=>{
  const sql=read('supabase/migrations/20260913000011_admin_session_interruptions.sql')
  assert.match(sql,/aezakmi_station_pause_session/)
  assert.match(sql,/aezakmi_cloud_remaining_seconds/)
  assert.match(sql,/aezakmi_cloud_elapsed_seconds/)
  assert.match(sql,/'pausedRemainingSeconds',remaining/)
  assert.match(sql,/'accruedAmount',amount_due/)
  assert.match(sql,/'isLocked',true/)
  assert.match(sql,/branch_session_pause_state_sync/)
  assert.match(sql,/'isLocked',false/)
})

test('Customer power interruption clears signed-in member or guest UI before Electron executes the power command',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const releaseAt=data.indexOf('await releaseStationLifecycle(interruptionReason')
  const dispatchAt=data.indexOf("aezakmi:admin-session-interruption",releaseAt)
  const executeAt=data.indexOf('executeRemoteCommand',dispatchAt)
  assert.ok(releaseAt>0&&dispatchAt>releaseAt&&executeAt>dispatchAt)
  assert.match(auth,/aezakmi:admin-session-interruption/)
  assert.match(auth,/onAdminSessionInterruption[\s\S]*lock\(\)/)
})

test('Admin UI freezes lock immediately and removes power-interrupted live sessions optimistically',()=>{
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(data,/isPowerInterruption = normalizedCommand === 'reboot' \|\| normalizedCommand === 'shutdown'/)
  assert.match(data,/isPowerInterruption[\s\S]*status:'offline', session:null/)
  assert.match(data,/pauseReason:'admin_lock'/)
  assert.match(data,/previousPc[\s\S]*isPowerInterruption/)
})
