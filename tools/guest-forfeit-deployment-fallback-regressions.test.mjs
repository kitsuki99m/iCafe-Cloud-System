import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const fn=fs.readFileSync(new URL('../supabase/functions/station-admin/index.ts', import.meta.url),'utf8')

test('station-admin forfeiture survives atomic-close RPC migration lag',()=>{
  assert.match(fn,/isMissingAtomicCloseRpc\(error\).*disposition==='forfeit'\|\|disposition==='refund'/s)
  assert.match(fn,/fallbackAction=disposition==='refund'\?'session\.refund':'session\.end'/)
  assert.match(fn,/fallbackPayload=disposition==='refund'\?\{sessionId\}:\{sessionId,disposition:'forfeit'\}/)
  assert.match(fn,/admin\.rpc\('aezakmi_cloud_execute'/)
})

test('legacy forfeit fallback recovers station/member identity for terminal wakeup',()=>{
  assert.match(fn,/branch_sessions'\)\.select\('pc_id,member_id'\)/)
  assert.match(fn,/reason=disposition==='forfeit'\?'session_forfeited'/)
  assert.match(fn,/broadcast\(device\.realtime_topic_key,\{kind:'session_changed',reason,sessionId,pcId:stationId,memberId:out\.memberId\|\|null,disposition,forceLogout:disposition==='forfeit'\}\)/)
})
