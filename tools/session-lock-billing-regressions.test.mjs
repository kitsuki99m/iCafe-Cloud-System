import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { elapsedSessionSeconds as customerElapsed, remainingSessionSeconds as customerRemaining } from '../apps/customer/src/lib/sessionTime.js'
import { elapsedSessionSeconds as adminElapsed, remainingSessionSeconds as adminRemaining } from '../apps/admin/src/lib/sessionTime.js'

const root=process.cwd()
const read=(file)=>readFileSync(resolve(root,file),'utf8')

for (const [label, elapsed, remaining] of [
  ['Customer', customerElapsed, customerRemaining],
  ['Admin', adminElapsed, adminRemaining],
]) {
  test(`${label} timers freeze prepaid and postpaid while the session is locked`,()=>{
    const now=1_000_000
    const prepaid={billing:'prepaid',remainingSeconds:900,observedAt:now-120_000,isLocked:true,pausedAt:now-120_000}
    assert.equal(remaining(prepaid,now),900)
    const postpaid={billing:'postpaid',billableSeconds:420,observedAt:now-120_000,isLocked:true,pausedAt:now-120_000}
    assert.equal(elapsed(postpaid,now),420)
  })

  test(`${label} postpaid fallback excludes completed historical lock time after resume`,()=>{
    const now=10_000_000
    const session={billing:'postpaid',startedAt:now-3600_000,pausedSeconds:600,isLocked:false}
    assert.equal(elapsed(session,now),3000)
  })
}

test('Cloud Customer session mapper uses the lock checkpoint instead of wall-clock time',()=>{
  const src=read('supabase/functions/station-api/index.ts')
  assert.match(src,/historicalPausedSeconds=Math\.max\(0,n\(row\.paused_seconds,0\)\)/)
  assert.match(src,/effectiveNow=isLocked&&Number\.isFinite\(pausedAt\)\?Math\.min\(now,pausedAt\):now/)
  assert.match(src,/frozenRemaining=maybeNumber\(data\.pausedRemainingSeconds/)
  assert.match(src,/billableSeconds=billing==='postpaid'&&isLocked&&frozenBillable!=null/)
  assert.match(src,/accruedAmount=billing==='postpaid'\?Math\.max/)
  assert.match(src,/isPaused:isLocked/)
})

test('Cloud Admin session mapper freezes both billing modes and keeps prior pauses excluded after unlock',()=>{
  const src=read('apps/admin/src/lib/cloudClient.js')
  assert.match(src,/const expiresAt = epoch\(row\.expires_at \?\? raw\.expiresAt\)/)
  assert.match(src,/const startedAt = epoch\(row\.started_at \?\? raw\.startedAt\)/)
  assert.match(src,/historicalPausedSeconds = Math\.max\(0, Number\(row\.paused_seconds/)
  assert.match(src,/effectiveNow = isLocked && pausedAt != null \? Math\.min\(now, pausedAt\) : now/)
  assert.match(src,/billableSeconds = billing === "postpaid" && isLocked/)
  assert.match(src,/remainingSeconds = billing === "prepaid"/)
  assert.match(src,/pausedSeconds: historicalPausedSeconds/)
})

test('Admin Manage Session and optimistic lock use pause-aware timer snapshots',()=>{
  const modal=read('apps/admin/src/components/floor/SessionModal.jsx')
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(modal,/elapsedSessionSeconds\(s, Date\.now\(\)\)/)
  assert.match(modal,/remainingSessionSeconds\(s, Date\.now\(\)\)/)
  assert.match(modal,/s\.isLocked === true/)
  assert.doesNotMatch(modal,/Date\.now\(\) - s\.startedAt/)
  assert.match(data,/remainingSeconds:remainingSessionSeconds\(target\.session,dispatchedAt\)/)
  assert.match(data,/billableSeconds:elapsedSessionSeconds\(target\.session,dispatchedAt\)/)
})


test('Cloud persists completed postpaid lock duration after unlock without double-counting prepaid',()=>{
  const sql=read('supabase/migrations/20260913000013_lock_billing_freeze_consistency.sql')
  assert.match(sql,/when billing_type='postpaid' then coalesce\(paused_seconds,0\)\+pause_seconds/)
  assert.match(sql,/else coalesce\(paused_seconds,0\)/)
  assert.match(sql,/where resumed_at is not null/)
  assert.match(sql,/and s\.billing_type='postpaid'/)
})

test('Café Edge billing authority itself remains pause-aware for both prepaid and postpaid',()=>{
  const util=read('backend/src/utils/sessionTime.js')
  assert.match(util,/remainingSecondsForSession[\s\S]*activeSessionPause/)
  assert.match(util,/elapsedBillableSeconds[\s\S]*pausedSecondsForSession/)
  assert.match(util,/pauseActiveSession[\s\S]*saved_remaining_seconds=\?,unsettled_amount_due=\?/)
  assert.match(util,/resumeActiveSession[\s\S]*expires_at=\?/) 
})
