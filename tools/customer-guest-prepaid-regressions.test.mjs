import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read=(file)=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Guest prepaid UI exposes Add Time using the existing guest-safe extension flow',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  const modal=read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(page,/\{isGuest \? \([\s\S]*setExtendOpen\(true\)[\s\S]*Add Time[\s\S]*Ask for Help/)
  assert.match(page,/memberId=\{user\.memberId\}/)
  assert.match(modal,/const availableMethods = memberId[\s\S]*: METHODS/)
  assert.match(data,/user\?\.role === 'guest' \? '\/public\/session-extensions' : '\/session-extensions'/)
})

test('Guest session state is never hydrated from a previous guest cache snapshot',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(data,/const cacheKey=user\?\.role === 'guest' \? null/)
  assert.match(data,/if \(cacheKey\) \{[\s\S]*readSnapshot\(cacheKey\)/)
  assert.match(data,/Guest session state must always come from the live station session/)
})

test('Café Edge implements the public guest session-end route already supported by Cloud Station API',()=>{
  const edge=read('backend/src/routes/apiRoutes.js')
  const cloud=read('supabase/functions/station-api/index.ts')
  assert.match(edge,/router\.post\("\/public\/sessions\/:id\/end", requirePairedStation/)
  assert.match(edge,/member_id IS NULL AND status='active'/)
  assert.match(edge,/releaseStationSession\(pc\.id,[\s\S]*expectedMemberId: null/)
  assert.match(edge,/beforeRemaining <= 0 \? "session_expired" : "guest_session_end"/)
  assert.match(cloud,/publicEndMatch=base\.match\(\/\^\\\/public\\\/sessions\\\/\(\[\^\/\]\+\)\\\/end\$\//)
})
