import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const admin=fs.readFileSync(new URL('../apps/admin/src/context/AppDataContext.jsx', import.meta.url),'utf8')

test('Member and Guest Pause & Save / Forfeit are DB-authoritative and do not wait for Customer Station',()=>{
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  assert.match(block,/const result=await apiPost\(`\/sessions\/\$\{sessionId\}\/end`, \{ disposition, \.\.\.options \}\)/)
  assert.match(block,/if \(disposition === 'save' \|\| disposition === 'forfeit'\)/)
  assert.match(block,/await commitPreparedSessionClose\(pc, committed, result\)/)
  assert.doesNotMatch(block,/await prepareSessionClose/)
  assert.doesNotMatch(block,/waitForStationCommand/)
})

test('Guest Refund remains DB-authoritative and Customer terminal signal is best effort',()=>{
  assert.match(admin,/const result=await apiPost\(`\/sessions\/\$\{sessionId\}\/refund`\)/)
  assert.match(admin,/if \(guestSession\) prepared=\{ pcId:pc\.id, sessionId, disposition:'refund', memberId:null, guestSession:true \}/)
  assert.match(admin,/if \(prepared\) await commitPreparedSessionClose\(pc, prepared, result\)/)
})
