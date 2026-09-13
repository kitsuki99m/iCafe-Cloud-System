import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('Admin active prepaid forfeiture is explicitly destructive for Member and Guest modes',()=>{
  const modal=read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(modal,/Forfeit this \$\{subject\} session\?/) 
  assert.match(modal,/member will stay signed in/) 
  assert.match(modal,/guest session will end immediately/) 
  assert.match(modal,/runSessionAction\('forfeit'\)/)
})

test('Interrupted Guest saved time has a dedicated local authoritative forfeit route',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/\/sessions\/:id\/forfeit-interrupted-guest/)
  assert.match(api,/status='ended' AND billing_type='prepaid' AND member_id IS NULL AND COALESCE\(saved_remaining_seconds,0\)>0/)
  assert.match(api,/UPDATE computer_sessions SET saved_remaining_seconds=0/)
  assert.match(api,/session\.forfeit_interrupted_guest/)
})

test('Cloud has a transaction-safe interrupted Guest forfeit RPC and Admin API route',()=>{
  const migration=read('supabase/migrations/20260914000016_forfeit_interrupted_guest_time.sql')
  const api=read('supabase/functions/admin-api/index.ts')
  assert.match(migration,/aezakmi_forfeit_interrupted_guest_session/)
  assert.match(migration,/for update/)
  assert.match(migration,/'savedRemainingSeconds',0/)
  assert.match(migration,/'interruptionForfeited',true/)
  assert.match(api,/forfeit-interrupted-guest/)
  assert.match(api,/aezakmi_forfeit_interrupted_guest_session/)
})

test('Interrupted Guest recovery UI offers both Restore and permanent Forfeit',()=>{
  const logs=read('apps/admin/src/pages/LogsPage.jsx')
  assert.match(logs,/forfeitInterruptedGuest/)
  assert.match(logs,/restore-interrupted-guest/)
  assert.match(logs,/forfeit-interrupted-guest/)
  assert.match(logs,/>Forfeit<\/button>/)
})

test('Guest active forfeiture immediately exits Customer Guest mode locally and through Cloud wakeup',()=>{
  const app=read('apps/customer/src/context/AppDataContext.jsx')
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  const adminApi=read('supabase/functions/admin-api/index.ts')
  assert.match(app,/\['session_forfeited','session_refunded'\]\.includes\(reason\)/)
  assert.match(app,/aezakmi:guest-session-ended/)
  assert.match(cloud,/aezakmi:cloud-station-wakeup/)
  assert.match(adminApi,/broadcastStationWakeup/)
  assert.match(adminApi,/reason:'session_forfeited'/)
})
