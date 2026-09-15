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

test('Guest sessions automatically leave Member Login even when Cloud sync trails Café Edge',()=>{
  const api=read('apps/customer/src/lib/api.js')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(api,/basePath==='\/guest\/session' && !data\?\.session/)
  assert.match(api,/const localGuest=await localApiFetch\(path, options\)/)
  assert.match(api,/if \(localGuest\?\.session\) return \{ \.\.\.localGuest, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:false \}/)
  assert.match(auth,/apiGetGuestSessionLocal/)
  assert.match(auth,/setInterval\(\(\)=>void detect\(\{ localOnly:true \}\),1000\)/)
  assert.match(auth,/setInterval\(\(\)=>void detect\(\{ localOnly:false \}\),5000\)/)
  assert.match(auth,/const guestUser=guestUserFromResponse\(d\);[\s\S]*setUser\(guestUser\);[\s\S]*compactGuestSessionImmediately\(d, guestUser\)/)
})

test('Local Café Edge requests use the Edge enrollment token before any Cloud station token',()=>{
  const api=read('apps/customer/src/lib/api.js')
  const edgePos=api.indexOf("const edgeToken = window.aezakmiClient?.getStationCredential?.()")
  const cloudPos=api.indexOf("const cloudToken = getCloudStationCredential()?.stationToken")
  const choosePos=api.indexOf('const stationToken = edgeToken || cloudToken')
  assert.ok(edgePos>=0 && cloudPos>edgePos && choosePos>cloudPos)
})

test('Detected Guest prepaid session is carried into a dedicated Guest Session UI immediately',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(auth,/guestSession: session/)
  assert.match(page,/pc\?\.session \?\? \(isGuest \? user\?\.guestSession \?\? null : null\)/)
  assert.match(page,/\{isGuest \? "Guest access" : "Signed in"\}/)
  assert.match(page,/Guest · Prepaid/)
  assert.match(page,/Guest prepaid session/)
  assert.match(page,/Guest Station/)
  assert.doesNotMatch(page,/Guest · Postpaid/)
})

test('Guest session fallback remains actionable before AppData refresh completes',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/const activePc = session[\s\S]*session,/)
  assert.match(page,/endSession\(activePc\)/)
  assert.match(page,/pc=\{isGuest \? activePc : pc\}/)
  assert.match(page,/legacyBillingSession \? "Call Staff" : "Ask for Help"/)
})


test('Guest/public station 401 responses never masquerade as member-auth expiry',()=>{
  const api=read('apps/customer/src/lib/api.js')
  assert.match(api,/response\.status === 401 && getToken\(\)/)
  assert.match(api,/error\?\.status === 401 && getToken\(\)/)
})

test('Active Guest UI survives transient null reconciliation and only ends after confirmed absence',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(data,/guestSessionAbsentConfirmed/)
  assert.match(data,/guestAbsentConfirmationsRef\.current >= 2/)
  assert.match(data,/guestSessionReconcilePending/)
  assert.match(auth,/if \(!session\) return null;/)
  assert.match(auth,/pcId: pc\?\.id \?\? session\.pcId \?\? null/)
})


test('Admin-started Guest session bypasses the idle dashboard and compacts immediately',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  assert.match(auth,/function compactGuestSessionImmediately\(data, guestUser\)/)
  assert.match(auth,/activateSession\?\.\(\{[\s\S]*memberId:null,[\s\S]*role:"guest"/)
  assert.doesNotMatch(auth,/d\?\.session\)[\s\S]{0,220}unlockClient\?\.\(\)/)
  assert.match(cloud,/const detail=outer\?\.payload&&typeof outer\.payload==='object'\?outer\.payload:outer/)
})
