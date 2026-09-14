import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Member and Guest Admin Save/Forfeit never wait for Customer Station acknowledgement',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  assert.match(block,/apiPost\(`\/sessions\/\$\{sessionId\}\/end`/)
  assert.match(block,/commitPreparedSessionClose/)
  assert.doesNotMatch(block,/await prepareSessionClose/)
  assert.doesNotMatch(block,/waitForStationCommand/)
  assert.doesNotMatch(block,/No Pause & Save, forfeit, or refund was committed/)
})

test('Customer Station terminal commit ACKs only after it has returned to login kiosk',()=>{
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const start=customer.indexOf('if (sessionCloseCommit)')
  const end=customer.indexOf('if (sessionCloseRelease)',start)
  const block=customer.slice(start,end)
  const login=block.indexOf('showLoginKiosk')
  const event=block.indexOf('aezakmi:admin-session-logout')
  const ack=block.indexOf("await ack('completed'")
  assert.ok(login>=0 && event>login && ack>event)
  assert.match(block,/sessionCloseCommitted:true/)
  assert.match(block,/forcedLogout:true/)
  assert.doesNotMatch(block,/command:'lock'/)
})

test('refund UI is mutually exclusive with other session actions',()=>{
  const modal=read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(modal,/function RefundControl\(\{ pc, refundableAmount, onRefund, busy = false \}\)/)
  assert.match(modal,/const disabled = refundableAmount <= 0 \|\| busy/)
  assert.match(modal,/busy=\{!!sessionAction\}/)
  assert.match(modal,/Closing the session and committing the refund/)
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
