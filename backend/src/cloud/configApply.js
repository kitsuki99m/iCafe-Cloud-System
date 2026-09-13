import crypto from 'node:crypto'
import argon2 from 'argon2'
import { db, nowIso } from '../db/connection.js'

const DEFAULT_MEMBER_PASSWORD='1234'
const pick=(value,...keys)=>{for(const key of keys)if(value?.[key]!==undefined)return value[key];return undefined}
const bool=value=>value?1:0

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
    const id=String(item?.id||'').trim();if(!id)continue
    const local=db.prepare('SELECT id,user_id,password_hash,created_at FROM members WHERE id=?').get(id)
    let userId=local?.user_id||null,passwordHash=local?.password_hash||null
    if(!userId){
      const byUsername=item?.username?db.prepare("SELECT id,password_hash FROM users WHERE username=? AND role='customer'").get(String(item.username)):null
      userId=byUsername?.id||crypto.randomUUID();passwordHash=byUsername?.password_hash||await argon2.hash(DEFAULT_MEMBER_PASSWORD)
    }
    prepared.push({item,id,local,userId,passwordHash})
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

export async function applyCloudConfig(config={}){
  const settings=config?.settings&&typeof config.settings==='object'?config.settings:null
  const managed=config?.cloudManaged&&typeof config.cloudManaged==='object'?config.cloudManaged:{}
  const preparedMembers=await prepareMembers(Array.isArray(managed.members)?managed.members:[])
  db.transaction(()=>{
    applySettings(settings)
    for(const plan of Array.isArray(managed.ratePlans)?managed.ratePlans:[])upsertRatePlan(plan)
    for(const announcement of Array.isArray(managed.announcements)?managed.announcements:[])upsertAnnouncement(announcement)
    for(const member of preparedMembers)upsertMember(member)
  })()
  return{appliedAt:nowIso(),settings:Boolean(settings),ratePlans:Array.isArray(managed.ratePlans)?managed.ratePlans.length:0,announcements:Array.isArray(managed.announcements)?managed.announcements.length:0,members:preparedMembers.length}
}
