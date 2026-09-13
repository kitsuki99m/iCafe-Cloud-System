import crypto from 'node:crypto'
import argon2 from 'argon2'
import { db, nowIso } from '../db/connection.js'

const DEFAULT_MEMBER_PASSWORD='1234'
const pick=(value,...keys)=>{for(const key of keys)if(value?.[key]!==undefined)return value[key];return undefined}
const bool=value=>value?1:0
const jsonText=value=>value==null?null:(typeof value==='string'?value:JSON.stringify(value))

function setApplyFlag(value){
  db.prepare("INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES('cloud_apply_in_progress',?,?)").run(value?'1':'0',nowIso())
}

function withCloudApply(fn){
  setApplyFlag(true)
  try{return db.transaction(fn)()}
  finally{setApplyFlag(false)}
}

function applySettings(settings){
  if(!settings||typeof settings!=='object')return false
  const stmt=db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)')
  for(const [key,value] of Object.entries(settings))stmt.run(key,typeof value==='string'?value:JSON.stringify(value))
  return true
}

function upsertRatePlan(plan){
  const id=String(plan?.id||'').trim();if(!id)return
  const existing=db.prepare('SELECT created_at FROM rate_plans WHERE id=?').get(id)
  const createdAt=pick(plan,'createdAt','created_at')||existing?.created_at||nowIso(),updatedAt=pick(plan,'updatedAt','updated_at')||nowIso()
  const days=pick(plan,'daysOfWeek','days_of_week');const daysValue=Array.isArray(days)?JSON.stringify(days):(days??null)
  db.prepare(`INSERT INTO rate_plans(id,name,mode,peso_unit,minutes_per_unit,min_amount,amount,minutes,base_minutes,bonus_minutes,description,customer_tier,customer_self_service,is_active,promo_kind,starts_at,ends_at,time_start,time_end,days_of_week,grace_minutes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,peso_unit=excluded.peso_unit,minutes_per_unit=excluded.minutes_per_unit,min_amount=excluded.min_amount,amount=excluded.amount,minutes=excluded.minutes,base_minutes=excluded.base_minutes,bonus_minutes=excluded.bonus_minutes,description=excluded.description,customer_tier=excluded.customer_tier,customer_self_service=excluded.customer_self_service,is_active=excluded.is_active,promo_kind=excluded.promo_kind,starts_at=excluded.starts_at,ends_at=excluded.ends_at,time_start=excluded.time_start,time_end=excluded.time_end,days_of_week=excluded.days_of_week,grace_minutes=excluded.grace_minutes,updated_at=excluded.updated_at`)
    .run(id,String(plan.name||'Rate Plan'),String(plan.mode||'linear'),pick(plan,'pesoUnit','peso_unit')??null,pick(plan,'minutesPerUnit','minutes_per_unit')??null,pick(plan,'minAmount','min_amount')??null,plan.amount??null,plan.minutes??null,pick(plan,'baseMinutes','base_minutes')??null,pick(plan,'bonusMinutes','bonus_minutes')??null,plan.description??null,String(pick(plan,'customerTier','customer_tier')||'Regular'),bool(pick(plan,'customerSelfService','customer_self_service')),bool(pick(plan,'isActive','is_active')!==false),String(pick(plan,'promoKind','promo_kind')||'none'),pick(plan,'startsAt','starts_at')??null,pick(plan,'endsAt','ends_at')??null,pick(plan,'timeStart','time_start')??null,pick(plan,'timeEnd','time_end')??null,daysValue,pick(plan,'graceMinutes','grace_minutes')??0,createdAt,updatedAt)
}

function upsertAnnouncement(item){
  const id=String(item?.id||'').trim();if(!id)return
  const existing=db.prepare('SELECT created_at FROM announcements WHERE id=?').get(id)
  db.prepare(`INSERT INTO announcements(id,title,message,kind,audience,is_active,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,message=excluded.message,kind=excluded.kind,audience=excluded.audience,is_active=excluded.is_active,updated_at=excluded.updated_at`)
    .run(id,String(item.title||'Announcement'),String(item.message||''),String(item.kind||'update'),String(item.audience||'all'),bool(pick(item,'isActive','is_active')!==false),null,pick(item,'createdAt','created_at')||existing?.created_at||nowIso(),pick(item,'updatedAt','updated_at')||nowIso())
}

async function prepareMembers(members){
  const prepared=[]
  for(const item of members||[]){
    const id=String(item?.id||item?.local_id||'').trim();if(!id)continue
    const local=db.prepare('SELECT id,user_id,password_hash,created_at FROM members WHERE id=?').get(id)
    let userId=local?.user_id||null,passwordHash=local?.password_hash||null
    if(!userId){
      const username=String(item?.username||'').trim()
      const byUsername=username?db.prepare("SELECT id,password_hash FROM users WHERE lower(username)=lower(?) AND role='customer'").get(username):null
      userId=byUsername?.id||crypto.randomUUID();passwordHash=byUsername?.password_hash||await argon2.hash(DEFAULT_MEMBER_PASSWORD)
    }
    prepared.push({item:{...item,id},id,local,userId,passwordHash})
  }
  return prepared
}

function upsertMember(prepared){
  const {item,id,local,userId,passwordHash}=prepared,username=String(item.username||'').trim()||null,createdAt=pick(item,'createdAt','created_at')||local?.created_at||nowIso(),updatedAt=pick(item,'updatedAt','updated_at')||nowIso()
  if(username){
    db.prepare(`INSERT INTO users(id,member_id,username,password_hash,role,is_active,must_change_credentials,auth_method,created_at,updated_at)
      VALUES(?,?,?,?, 'customer',1,1,'password',?,?) ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id,username=excluded.username,is_active=1,updated_at=excluded.updated_at`)
      .run(userId,id,username,passwordHash,createdAt,updatedAt)
  }
  db.prepare(`INSERT INTO members(id,user_id,member_code,name,username,birthdate,phone,email,tier,wallet_balance,session_seconds_remaining,status,pc_id,pc_ip,password_hash,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,member_code=excluded.member_code,name=excluded.name,username=excluded.username,birthdate=excluded.birthdate,phone=excluded.phone,email=excluded.email,tier=excluded.tier,wallet_balance=excluded.wallet_balance,session_seconds_remaining=excluded.session_seconds_remaining,status=excluded.status,pc_id=excluded.pc_id,pc_ip=excluded.pc_ip,updated_at=excluded.updated_at`)
    .run(id,userId,pick(item,'memberCode','member_code')||`M-${id.slice(0,8).toUpperCase()}`,String(item.name||username||'Member'),username,item.birthdate||null,item.phone||null,item.email||null,String(item.tier||'Regular'),Number(pick(item,'walletBalance','wallet_balance')||0),Number(pick(item,'sessionSecondsRemaining','session_seconds_remaining')||0),String(item.status||'active'),pick(item,'pcId','pc_id')||null,pick(item,'pcIp','pc_ip')||null,passwordHash,createdAt,updatedAt)
}

function upsertCloudCredential(row){
  const memberId=String(row?.member_id||row?.memberId||'').trim();if(!memberId)return
  const usernameCi=String(row?.username_ci||row?.usernameCi||'').trim().toLowerCase();if(!usernameCi)return
  db.prepare(`INSERT INTO cloud_member_credentials(member_id,username_ci,password_salt,password_hash,password_iterations,must_change_credentials,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET username_ci=excluded.username_ci,password_salt=excluded.password_salt,password_hash=excluded.password_hash,password_iterations=excluded.password_iterations,must_change_credentials=excluded.must_change_credentials,updated_at=excluded.updated_at`)
    .run(memberId,usernameCi,String(row.password_salt||row.passwordSalt||''),String(row.password_hash||row.passwordHash||''),Number(row.password_iterations||row.passwordIterations||210000),bool(row.must_change_credentials??row.mustChangeCredentials),String(row.updated_at||row.updatedAt||nowIso()))
  db.prepare(`UPDATE users SET must_change_credentials=?,updated_at=? WHERE member_id=? AND role='customer'`).run(bool(row.must_change_credentials??row.mustChangeCredentials),String(row.updated_at||row.updatedAt||nowIso()),memberId)
}

function upsertRuntimeStation(row,deviceMap){
  const id=String(row?.local_id||row?.id||'').trim();if(!id)return
  const ip=String(row?.ip_address||row?.ipAddress||'').trim();if(!ip)return
  const existing=db.prepare('SELECT created_at FROM pcs WHERE id=?').get(id)
  const device=deviceMap.get(id)
  db.prepare(`INSERT INTO pcs(id,pc_number,label,ip_address,mac_address,spec,status,created_at,updated_at,station_token_hash,paired_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET pc_number=excluded.pc_number,label=excluded.label,ip_address=excluded.ip_address,mac_address=excluded.mac_address,spec=excluded.spec,status=excluded.status,updated_at=excluded.updated_at,station_token_hash=COALESCE(excluded.station_token_hash,pcs.station_token_hash),paired_at=COALESCE(excluded.paired_at,pcs.paired_at)`)
    .run(id,row.pc_number||row.pcNumber||null,String(row.label||row.pc_number||id),ip,row.mac_address||row.macAddress||null,row.spec||null,String(row.status||'offline'),row.created_at||row.createdAt||existing?.created_at||nowIso(),row.updated_at||row.updatedAt||nowIso(),device?.device_token_hash||device?.deviceTokenHash||null,device?.created_at||device?.pairedAt||null)
}

function upsertRuntimeSession(row){
  const id=String(row?.local_id||row?.id||'').trim();if(!id)return
  db.prepare(`INSERT INTO computer_sessions(id,member_id,pc_id,rate_plan_id,customer_name,billing_type,amount_paid,prepaid_seconds,postpaid_rate_per_minute,settlement_method,started_at,expires_at,last_heartbeat_at,ended_at,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id,pc_id=excluded.pc_id,rate_plan_id=excluded.rate_plan_id,customer_name=excluded.customer_name,billing_type=excluded.billing_type,amount_paid=excluded.amount_paid,prepaid_seconds=excluded.prepaid_seconds,postpaid_rate_per_minute=excluded.postpaid_rate_per_minute,settlement_method=excluded.settlement_method,started_at=excluded.started_at,expires_at=excluded.expires_at,last_heartbeat_at=excluded.last_heartbeat_at,ended_at=excluded.ended_at,status=excluded.status`)
    .run(id,row.member_id||null,row.pc_id||null,row.rate_plan_id||null,String(row.customer_name||'Guest'),String(row.billing_type||'prepaid'),row.amount_paid==null?null:Number(row.amount_paid),row.prepaid_seconds==null?null:Number(row.prepaid_seconds),row.postpaid_rate_per_minute==null?null:Number(row.postpaid_rate_per_minute),row.settlement_method||null,row.started_at||nowIso(),row.expires_at||null,row.last_heartbeat_at||null,row.ended_at||null,String(row.status||'active'))
}

function upsertWalletLedger(row){
  const id=String(row?.local_id||row?.id||'').trim();if(!id||!row?.member_id)return
  db.prepare(`INSERT OR IGNORE INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id,String(row.member_id),String(row.type||'cloud'),Number(row.amount||0),Number(row.balance_before||0),Number(row.balance_after||0),row.reference_type||null,row.reference_id||null,row.created_at||nowIso())
}
function upsertTimeLedger(row){
  const id=String(row?.local_id||row?.id||'').trim();if(!id||!row?.member_id)return
  db.prepare(`INSERT OR IGNORE INTO session_time_transactions(id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id,String(row.type||'cloud'),String(row.member_id),row.counterparty_member_id||null,row.computer_session_id||null,Number(row.seconds||0),row.reference_id||null,null,row.created_at||nowIso())
}
function upsertTopUp(row){
  const d=row?.data&&typeof row.data==='object'?row.data:row;const id=String(row?.local_id||d?.id||'').trim();if(!id||!d?.memberId&&!d?.member_id)return
  db.prepare(`INSERT INTO top_up_requests(id,member_id,pc_id,amount,payment_method,ref_no,status,requested_at,processed_at,processed_by)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id,pc_id=excluded.pc_id,amount=excluded.amount,payment_method=excluded.payment_method,ref_no=excluded.ref_no,status=excluded.status,requested_at=excluded.requested_at,processed_at=excluded.processed_at,processed_by=excluded.processed_by`)
    .run(id,d.memberId||d.member_id,d.pcId||d.pc_id||null,Number(d.amount||0),String(d.paymentMethod||d.payment_method||'cash'),d.refNo||d.ref_no||null,String(d.status||'pending'),d.requestedAt||d.requested_at||row.requested_at||nowIso(),d.processedAt||d.processed_at||null,d.processedBy||d.processed_by||null)
}
function upsertExtension(row){
  const d=row?.data&&typeof row.data==='object'?row.data:row;const id=String(row?.local_id||d?.id||'').trim();if(!id||!(d.sessionId||d.computer_session_id))return
  db.prepare(`INSERT INTO session_extensions(id,computer_session_id,member_id,rate_plan_id,amount,minutes_added,payment_method,status,requested_at,confirmed_at,confirmed_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET computer_session_id=excluded.computer_session_id,member_id=excluded.member_id,rate_plan_id=excluded.rate_plan_id,amount=excluded.amount,minutes_added=excluded.minutes_added,payment_method=excluded.payment_method,status=excluded.status,requested_at=excluded.requested_at,confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by`)
    .run(id,d.sessionId||d.computer_session_id,d.memberId||d.member_id||null,d.ratePlanId||d.rate_plan_id||null,Number(d.amount||0),Number(d.minutesAdded||d.minutes_added||0),String(d.paymentMethod||d.payment_method||'cash'),String(d.status||'pending'),d.requestedAt||d.requested_at||row.requested_at||nowIso(),d.confirmedAt||d.confirmed_at||null,d.confirmedBy||d.confirmed_by||null)
}
function upsertRevenue(row){
  const id=String(row?.local_id||row?.id||'').trim();if(!id)return
  db.prepare(`INSERT OR IGNORE INTO revenue_events(id,event_type,source_type,source_id,amount_centavos,occurred_at,created_by,category,payment_method,member_id,pc_id,metadata,reversed_event_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,String(row.event_type||'cloud'),String(row.source_type||'cloud'),String(row.source_id||id),Number(row.amount_centavos||0),row.occurred_at||nowIso(),null,row.category||null,row.payment_method||null,row.member_id||null,row.pc_id||null,jsonText(row.metadata||{}),row.reversed_event_id||null)
}
function upsertPause(row){
  const id=String(row?.local_id||row?.id||'').trim();if(!id||!row?.computer_session_id)return
  db.prepare(`INSERT INTO session_pauses(id,computer_session_id,reason,paused_at,resumed_at,command_id,created_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET computer_session_id=excluded.computer_session_id,reason=excluded.reason,paused_at=excluded.paused_at,resumed_at=excluded.resumed_at,command_id=excluded.command_id`)
    .run(id,String(row.computer_session_id),String(row.reason||'cloud'),row.paused_at||nowIso(),row.resumed_at||null,row.command_id||null,null)
}
function replaceCloudAuthSessions(rows,deviceMap){
  db.prepare('DELETE FROM cloud_customer_auth_sessions').run()
  const insert=db.prepare(`INSERT INTO cloud_customer_auth_sessions(token_hash,member_id,station_device_id,local_station_id,created_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)`)
  for(const row of rows||[]){const device=[...deviceMap.values()].find(v=>String(v.id)===String(row.station_device_id));const localStationId=device?.local_station_id||device?.localStationId||null;if(!row?.token_hash||!row?.member_id||!localStationId)continue;insert.run(String(row.token_hash),String(row.member_id),String(row.station_device_id),String(localStationId),row.created_at||nowIso(),row.last_seen_at||nowIso(),row.expires_at||nowIso(),row.revoked_at||null)}
}

export async function applyCloudConfig(config={}){
  const settings=config?.settings&&typeof config.settings==='object'?config.settings:null
  const managed=config?.cloudManaged&&typeof config.cloudManaged==='object'?config.cloudManaged:{}
  const preparedMembers=await prepareMembers(Array.isArray(managed.members)?managed.members:[])
  withCloudApply(()=>{
    applySettings(settings)
    for(const plan of Array.isArray(managed.ratePlans)?managed.ratePlans:[])upsertRatePlan(plan)
    for(const announcement of Array.isArray(managed.announcements)?managed.announcements:[])upsertAnnouncement(announcement)
    for(const member of preparedMembers)upsertMember(member)
  })
  return{appliedAt:nowIso(),settings:Boolean(settings),ratePlans:Array.isArray(managed.ratePlans)?managed.ratePlans.length:0,announcements:Array.isArray(managed.announcements)?managed.announcements.length:0,members:preparedMembers.length}
}

export async function applyCloudRuntime(runtime={}){
  if(!runtime||typeof runtime!=='object')return{applied:false}
  const memberRows=Array.isArray(runtime.members)?runtime.members:[]
  const preparedMembers=await prepareMembers(memberRows.map(r=>({...r,id:r.local_id||r.id})))
  const credentials=Array.isArray(runtime.credentials)?runtime.credentials:[]
  const stations=Array.isArray(runtime.stations)?runtime.stations:[]
  const stationDevices=Array.isArray(runtime.stationDevices)?runtime.stationDevices:[]
  const deviceMap=new Map(stationDevices.map(d=>[String(d.local_station_id||d.localStationId||''),d]))
  const cloudMemberIds=new Set(preparedMembers.map(x=>x.id))
  const cloudCredentialIds=new Set(credentials.map(r=>String(r.member_id||r.memberId||'')))

  withCloudApply(()=>{
    for(const member of preparedMembers)upsertMember(member)
    // The Cloud member list is authoritative after event reconciliation. Keep old
    // rows for ledger/history integrity, but disable accounts removed in Cloud.
    for(const row of db.prepare("SELECT id,user_id FROM members WHERE status='active'").all()){
      if(!cloudMemberIds.has(String(row.id))){db.prepare("UPDATE members SET status='archived',updated_at=? WHERE id=?").run(nowIso(),row.id);if(row.user_id)db.prepare('UPDATE users SET is_active=0,updated_at=? WHERE id=?').run(nowIso(),row.user_id)}
    }
    for(const credential of credentials)upsertCloudCredential(credential)
    for(const row of db.prepare('SELECT member_id FROM cloud_member_credentials').all())if(!cloudCredentialIds.has(String(row.member_id)))db.prepare('DELETE FROM cloud_member_credentials WHERE member_id=?').run(row.member_id)
    for(const station of stations)upsertRuntimeStation(station,deviceMap)
    replaceCloudAuthSessions(Array.isArray(runtime.authSessions)?runtime.authSessions:[],deviceMap)
    for(const session of Array.isArray(runtime.sessions)?runtime.sessions:[])upsertRuntimeSession(session)
    for(const row of Array.isArray(runtime.walletLedger)?runtime.walletLedger:[])upsertWalletLedger(row)
    for(const row of Array.isArray(runtime.sessionTimeLedger)?runtime.sessionTimeLedger:[])upsertTimeLedger(row)
    for(const row of Array.isArray(runtime.topUps)?runtime.topUps:[])upsertTopUp(row)
    for(const row of Array.isArray(runtime.extensions)?runtime.extensions:[])upsertExtension(row)
    for(const row of Array.isArray(runtime.revenueEvents)?runtime.revenueEvents:[])upsertRevenue(row)
    for(const row of Array.isArray(runtime.pauses)?runtime.pauses:[])upsertPause(row)
  })
  return{applied:true,cursor:runtime.cursor||null,members:preparedMembers.length,credentials:credentials.length,stations:stations.length,sessions:Array.isArray(runtime.sessions)?runtime.sessions.length:0}
}
