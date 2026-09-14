import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('member and guest forfeit/refund wait for Customer Station exit acknowledgement',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(admin,/prepareSessionClose/)
  assert.match(admin,/waitForStationCommand/)
  assert.match(admin,/sessionClose:true/)
  assert.match(admin,/disposition === 'save' \|\| disposition === 'forfeit'/)
  assert.match(admin,/prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/await prepareSessionClose\(pc, 'refund'\)/)
  assert.match(admin,/command:'game_update'/)
  assert.match(admin,/No Pause & Save, forfeit, or refund was committed/)
})

test('Customer Station ACKs close only after the Electron kiosk is locally protected',()=>{
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(customer,/const sessionClose=Boolean\(payload\?\.payload\?\.sessionClose\)/)
  const start=customer.indexOf('if (sessionClose)')
  const lock=customer.indexOf("executeRemoteCommand",start)
  const ack=customer.indexOf("await ack('completed'",lock)
  assert.ok(start>=0 && lock>start && ack>lock)
  assert.match(customer.slice(start,ack),/command:'lock'/)
  assert.match(customer,/sessionExitReady:true/)
  assert.doesNotMatch(customer.slice(start,ack),/clearStationLifecycleMarker/)
})

test('refund UI is mutually exclusive with other session actions',()=>{
  const modal=read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(modal,/function RefundControl\(\{ pc, refundableAmount, onRefund, busy = false \}\)/)
  assert.match(modal,/const disabled = refundableAmount <= 0 \|\| busy/)
  assert.match(modal,/busy=\{!!sessionAction\}/)
  assert.match(modal,/Protecting Customer Station and waiting for its close acknowledgement/)
})

test('command status can be polled locally and through Cloud Admin',()=>{
  const ops=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('apps/admin/src/lib/cloudClient.js')
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(ops,/remote-commands\/:id/)
  assert.match(cloud,/command_status/)
  assert.match(fn,/action==='command_status'/)
})

test('direct forfeit/refund closes handshake pause rows',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const migration=read('supabase/migrations/20260914000017_close_session_pause_on_end.sql')
  const matches=api.match(/UPDATE session_pauses SET resumed_at=\? WHERE computer_session_id=\? AND resumed_at IS NULL/g)||[]
  assert.ok(matches.length>=2)
  assert.match(migration,/branch_session_close_active_pause/)
  assert.match(migration,/old.status='active' and new.status='ended'/)
})
