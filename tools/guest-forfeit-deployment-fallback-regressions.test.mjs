import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const fn=fs.readFileSync(new URL('../supabase/functions/station-admin/index.ts', import.meta.url),'utf8')

test('station-admin session close survives atomic-close RPC migration/runtime failure',()=>{
  assert.match(fn,/if\(error\)\{[\s\S]*atomic session close failed; using compatibility path/)
  assert.match(fn,/if\(disposition==='save'\)[\s\S]*aezakmi_station_release_session/)
  assert.match(fn,/fallbackAction=disposition==='refund'\?'session\.refund':'session\.end'/)
  assert.match(fn,/fallbackPayload=disposition==='refund'\?\{sessionId\}:\{sessionId,disposition:'forfeit'\}/)
  assert.match(fn,/admin\.rpc\('aezakmi_cloud_execute'/)
})

test('compatibility close keeps pre-close station/member identity and sends terminal wakeup',()=>{
  assert.match(fn,/select\('local_id,pc_id,member_id,billing_type,data'\)/)
  assert.match(fn,/pcId:out\.pcId\|\|before\.pc_id/)
  assert.match(fn,/memberId:Object\.prototype\.hasOwnProperty\.call\(out,'memberId'\)\?out\.memberId:\(before\.member_id\|\|null\)/)
  assert.match(fn,/reason=disposition==='forfeit'\?'session_forfeited'/)
  assert.match(fn,/broadcast\(device\.realtime_topic_key,\{kind:'session_changed',reason,sessionId,pcId:stationId,memberId:out\.memberId\|\|null,disposition,forceLogout:true\}\)/)
})
