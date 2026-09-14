import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('local public Guest end remains unauthenticated while Admin terminal close is scoped only to authenticated route',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const publicStart=api.indexOf('router.post("/public/sessions/:id/end"')
  const adminStart=api.indexOf('router.post("/sessions/:id/end"',publicStart)
  const publicBlock=api.slice(publicStart,adminStart)
  const adminEnd=api.indexOf('router.post(\n  "/sessions/:id/refund"',adminStart)
  const adminBlock=api.slice(adminStart,adminEnd)
  assert.doesNotMatch(publicBlock,/req\.auth\.role/)
  assert.doesNotMatch(publicBlock,/adminTerminalClose/)
  assert.match(adminBlock,/const adminTerminalClose = req\.auth\.role === "admin" && \["save", "forfeit"\]\.includes\(disposition\)/)
  assert.match(adminBlock,/forceLogout: adminTerminalClose/)
})

test('Admin terminal close logs out both member and guest without depending on station command delivery',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  assert.doesNotMatch(block,/await prepareSessionClose/)
  assert.match(block,/apiPost\(`\/sessions\/\$\{sessionId\}\/end`/)
  assert.match(customer,/payload\?\.forceLogout === true/)
  assert.match(customer,/aezakmi:admin-session-logout/)
  assert.match(customer,/aezakmi:admin-forfeit-logout/)
  assert.match(auth,/onAdminSessionLogout/)
  assert.match(auth,/admin_pause_save/)
})
