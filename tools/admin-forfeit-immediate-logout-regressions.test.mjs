import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Admin Forfeit is a forced logout command, not the ordinary Lock Session command',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const start=customer.indexOf('if (sessionClose)')
  const forfeit=customer.indexOf("if (disposition === 'forfeit')",start)
  const save=customer.indexOf('// Save/refund protection',forfeit)
  const block=customer.slice(forfeit,save)
  assert.match(admin,/if \(disposition === 'forfeit'\) prepared=await prepareSessionClose\(pc, disposition\)/)
  assert.match(block,/showLoginKiosk/)
  assert.match(block,/aezakmi:admin-forfeit-logout/)
  assert.doesNotMatch(block,/executeRemoteCommand/)
  assert.doesNotMatch(block,/command:'lock'/)
})

test('forced forfeit logout bypasses normal customer lifecycle saving',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const start=auth.indexOf('const onAdminForfeitLogout')
  const end=auth.indexOf('const onStationSessionInterruption',start)
  const block=auth.slice(start,end)
  assert.match(block,/clearStationLifecycleMarker\(\)/)
  assert.match(block,/lock\(\)/)
  assert.doesNotMatch(block,/releaseStationLifecycle/)
})

test('Cafe Edge revokes active customer auth when staff forfeits a session',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/end_reason=COALESCE\(end_reason,'admin_forfeit'\)/)
  assert.match(api,/user_id IN \(SELECT id FROM users WHERE role='customer'\)/)
  assert.match(api,/emit\('auth:revoked',\{reason:'admin_forfeit'/)
})

test('Cloud forfeiture revokes station customer auth and broadcasts forced logout',()=>{
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(fn,/disposition==='forfeit'&&device\?\.id/)
  assert.match(fn,/branch_customer_auth_sessions/)
  assert.match(fn,/forceLogout:disposition==='forfeit'/)
})
