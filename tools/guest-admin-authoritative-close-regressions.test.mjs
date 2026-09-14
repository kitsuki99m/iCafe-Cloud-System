import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const admin=fs.readFileSync(new URL('../apps/admin/src/context/AppDataContext.jsx', import.meta.url),'utf8')

test('Guest Pause & Save / Forfeit commit without waiting for Customer Station ACK',()=>{
  assert.match(admin,/const guestSession=memberId == null/)
  assert.match(admin,/if \(!guestSession && \(disposition === 'save' \|\| disposition === 'forfeit'\)\) prepared=await prepareSessionClose/)
  assert.match(admin,/const result=await apiPost\(`\/sessions\/\$\{sessionId\}\/end`, \{ disposition, \.\.\.options \}\)/)
  assert.match(admin,/if \(guestSession && \(disposition === 'save' \|\| disposition === 'forfeit'\)\) \{[\s\S]*guestSession:true/)
})

test('Guest Refund is also DB-authoritative and Customer terminal signal is best effort',()=>{
  assert.match(admin,/if \(!guestSession\) prepared=await prepareSessionClose\(pc, 'refund'\)/)
  assert.match(admin,/const result=await apiPost\(`\/sessions\/\$\{sessionId\}\/refund`\)/)
  assert.match(admin,/if \(guestSession\) prepared=\{ pcId:pc\.id, sessionId, disposition:'refund', memberId:null, guestSession:true \}/)
  assert.match(admin,/if \(prepared\) await commitPreparedSessionClose\(pc, prepared, result\)/)
})
