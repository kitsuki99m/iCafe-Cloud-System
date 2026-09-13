import { Router } from 'express'
import { db, nowIso, transaction } from '../db/connection.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requirePairedStation } from '../middleware/clientIdentity.js'
import { id } from '../utils/helpers.js'
import { emitToRoom, emitToStaff, emitWalletUpdated, emitDataChanged } from '../realtime.js'
import { activeSessionPause, pauseActiveSession, releaseStationSession, resumeActiveSession } from '../utils/sessionTime.js'
import { enqueueCloudEvent } from '../cloud/outbox.js'

const router=Router()
const auth=authenticate
const REMOTE_COMMAND_TIMEOUT_MS=15000
const POS_ORDER_RESERVATION_MS=15*60*1000

function recordPosRevenue(order,userId){const cents=Math.round(Number(order.total||0)*100);if(cents<=0)return;db.prepare("INSERT OR IGNORE INTO revenue_events(id,event_type,source_type,source_id,amount_centavos,occurred_at,created_by,category,payment_method,member_id,pc_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id(),'pos_sale','pos_order',order.id,cents,nowIso(),userId,'pos',order.payment_method,order.member_id,order.pc_id)}

function applyCompletedCommand(command) {
  // Blocking commands are checkpointed before they are dispatched. Unlock is
  // the only billing transition that waits for a successful station ACK so a
  // failed unlock can never restart the paid clock behind a still-locked UI.
  if (command.command === 'unlock') return resumeActiveSession(command.pc_id,{commandId:command.id,at:nowIso()})
  return null
}

function interruptForQueuedCommand(command, at=nowIso()) {
  if (command.command === 'lock') {
    return pauseActiveSession(command.pc_id,{reason:'admin_lock',commandId:command.id,userId:command.requested_by,at})
  }
  if (command.command === 'reboot' || command.command === 'shutdown') {
    const released=releaseStationSession(command.pc_id,{reason:command.command,at,markAvailable:false})
    db.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),ended_at=COALESCE(ended_at,?),end_reason=COALESCE(end_reason,?) WHERE pc_id=? AND revoked_at IS NULL")
      .run(at,at,command.command,command.pc_id)
    // The seat must never look reusable while a power command is in-flight.
    // A successful reconnect will restore Available; an ACKed command failure
    // below restores it immediately because the station is still alive.
    db.prepare("UPDATE pcs SET status='offline',updated_at=? WHERE id=? AND status<>'maintenance'").run(at,command.pc_id)
    return released?.released ? { session:released, released:true } : { session:null, released:false }
  }
  return null
}

function transitionRemoteCommand(commandId, status, result) {
  return transaction(() => {
    const command = db.prepare('SELECT * FROM remote_commands WHERE id=?').get(commandId)
    if (!command) throw Object.assign(new Error('Command not found.'),{status:404,code:'COMMAND_NOT_FOUND',expose:true})
    const allowed = command.status === 'queued' ? ['running','failed'] : command.status === 'running' ? ['completed','failed'] : []
    if (!allowed.includes(status)) throw Object.assign(new Error(`Command cannot move from ${command.status} to ${status}.`),{status:409,code:'INVALID_COMMAND_TRANSITION',expose:true})
    const executedAt = status === 'running' ? null : nowIso()
    const updated = db.prepare('UPDATE remote_commands SET status=?,executed_at=?,result=? WHERE id=? AND status=?')
      .run(status,executedAt,result?JSON.stringify(result):null,command.id,command.status)
    if (updated.changes !== 1) throw Object.assign(new Error('Command status changed before this acknowledgement was applied.'),{status:409,code:'COMMAND_STATE_CONFLICT',expose:true})
    const affected = status === 'completed' ? applyCompletedCommand(command) : null
    if (status === 'failed' && (command.command === 'reboot' || command.command === 'shutdown')) {
      db.prepare("UPDATE pcs SET status='available',updated_at=? WHERE id=? AND status='offline' AND NOT EXISTS (SELECT 1 FROM computer_sessions WHERE pc_id=? AND status='active')")
        .run(executedAt || nowIso(),command.pc_id,command.pc_id)
    }
    return { command:{...command,status,executed_at:executedAt,result:result?JSON.stringify(result):null}, affected }
  })
}

function publishRemoteCommandTransition(transition, result) {
  const command = transition.command
  emitToStaff('remote:command-status',{id:command.id,pcId:command.pc_id,status:command.status,result})
  if (command.cloud_command_id) enqueueCloudEvent('cloud_command.ack',{id:command.cloud_command_id,status:command.status,result:result&&typeof result==='object'?result:{}},{entityType:'cloud_command',entityId:command.cloud_command_id})
  if(transition.affected?.session) {
    emitToRoom(`pc:${command.pc_id}`,'session:updated',{sessionId:transition.affected.session.id,pcId:command.pc_id,memberId:transition.affected.session.member_id,reason:command.command==='unlock'?'session_resumed':'session_paused',locked:command.command!=='unlock'})
  }
}

router.post('/remote-commands',auth,requireRole('admin'),(req,res,next)=>{
  try {
    const {pcId,command,payload=null}=req.body??{}
    if(!pcId||!['lock','unlock','reboot','shutdown','wake','game_update'].includes(command)) return res.status(400).json({success:false,code:'INVALID_COMMAND',error:'PC and valid command are required.'})
    const pc=db.prepare('SELECT id,status FROM pcs WHERE id=?').get(pcId)
    if(!pc) return res.status(404).json({success:false,code:'PC_NOT_FOUND',error:'PC not found.'})
    if(pc.status==='offline') return res.status(409).json({success:false,code:'PC_OFFLINE',error:'The station is offline and cannot receive commands.'})
    const active=db.prepare("SELECT id,member_id FROM computer_sessions WHERE pc_id=? AND status='active' LIMIT 1").get(pcId)
    const pause=active ? activeSessionPause(active.id) : null
    if(command==='lock' && !active) return res.status(409).json({success:false,code:'SESSION_REQUIRED',error:'Lock Session requires an active session.'})
    if(command==='lock' && pause) return res.status(409).json({success:false,code:'SESSION_ALREADY_LOCKED',error:'This session is already locked.'})
    if(command==='unlock' && !pause) return res.status(409).json({success:false,code:'SESSION_NOT_LOCKED',error:'This session is not locked.'})
    // A station can disappear after accepting a command. Do not let an old
    // queued/running command block every later control action forever.
    const expiryNow=nowIso()
    db.prepare("UPDATE remote_commands SET status='failed',executed_at=?,result=? WHERE pc_id=? AND status IN ('queued','running') AND ((expires_at IS NOT NULL AND expires_at<=?) OR (expires_at IS NULL AND julianday(requested_at)<=julianday('now','-30 seconds')))")
      .run(expiryNow,JSON.stringify({error:'Station command expired without acknowledgement.',code:'REMOTE_COMMAND_EXPIRED'}),pcId,expiryNow)
    const pending=db.prepare("SELECT id FROM remote_commands WHERE pc_id=? AND status IN ('queued','running') LIMIT 1").get(pcId)
    if(pending) return res.status(409).json({success:false,code:'COMMAND_PENDING',error:'Wait for the current station command to finish.'})
    const commandId=id(), requestedAt=nowIso(), warningSeconds=['shutdown','reboot'].includes(command) ? 5 : 0
    const warningExpiresAt = warningSeconds ? new Date(Date.now() + warningSeconds * 1000).toISOString() : null
    const expiresAt = new Date(Date.now() + Math.max(REMOTE_COMMAND_TIMEOUT_MS, warningSeconds * 1000 + 10000)).toISOString()
    const queuedCommand={id:commandId,pc_id:pcId,command,payload,requested_by:req.auth.userId}
    const interruption=transaction(() => {
      db.prepare('INSERT INTO remote_commands(id,pc_id,command,payload,status,requested_by,requested_at,warning_started_at,warning_expires_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(commandId,pcId,command,JSON.stringify(payload),'queued',req.auth.userId,requestedAt,warningSeconds ? requestedAt : null,warningExpiresAt,expiresAt)
      return interruptForQueuedCommand(queuedCommand,requestedAt)
    })
    if (interruption?.session) {
      const s=interruption.session
      emitToStaff('session:updated',{sessionId:s.id,pcId,memberId:s.member_id || null,reason:interruption.released?'session_interrupted':'session_paused',endReason:interruption.released?command:null,remainingSeconds:Number(s.remainingSeconds ?? 0),amountDue:Number(s.amountDue ?? 0),settlementPending:Boolean(s.settlementPending),locked:true})
      emitToRoom(`pc:${pcId}`,'session:updated',{sessionId:s.id,pcId,memberId:s.member_id || null,reason:interruption.released?'session_interrupted':'session_paused',endReason:interruption.released?command:null,remainingSeconds:Number(s.remainingSeconds ?? 0),amountDue:Number(s.amountDue ?? 0),settlementPending:Boolean(s.settlementPending),locked:true})
    }
    emitDataChanged({method:'INTERRUPT',path:'/remote-commands',pcId,command})
    // Deliver the power command first so its async handler is already running
    // before the immediate auth-revocation event causes React to clear identity.
    emitToRoom(`pc:${pcId}`,'remote:command',{id:commandId,command,payload,warningSeconds,warningExpiresAt,expiresAt})
    if (['shutdown','reboot'].includes(command)) emitToRoom(`pc:${pcId}`,'auth:revoked',{reason:command,pcId,immediate:true})
    setTimeout(() => {
      const timedOut = db.prepare("UPDATE remote_commands SET status='failed',executed_at=?,result=? WHERE id=? AND status IN ('queued','running')").run(nowIso(),JSON.stringify({ error:'Station command acknowledgement timed out.' }),commandId)
      if (timedOut.changes) {
        const result={error:'Station command acknowledgement timed out.'}
        emitToStaff('remote:command-status',{id:commandId,pcId,status:'failed',result})
        emitDataChanged({method:'TIMEOUT',path:`/remote-commands/${commandId}`})
      }
    }, Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    res.status(201).json({success:true,commandId,status:'queued',expiresAt})
  }catch(e){next(e)}
})

router.get('/remote-commands',auth,requireRole('admin'),(req,res)=>res.json({success:true,commands:db.prepare("SELECT rc.*,p.label pc_label,p.ip_address pc_ip FROM remote_commands rc JOIN pcs p ON p.id=rc.pc_id WHERE rc.status IN ('queued','running') ORDER BY rc.requested_at ASC").all()}))

router.patch('/public/remote-commands/:id',requirePairedStation,(req,res,next)=>{
  try {
    const {status,result=null}=req.body??{}
    if(!req.pc) return res.status(403).json({success:false,code:'PC_NOT_REGISTERED',error:'This station is not registered.'})
    if(req.pc.station_token_hash && !req.stationAuthenticated) return res.status(403).json({success:false,code:'STATION_NOT_PAIRED',error:'Station enrollment credential is missing or invalid.'})
    if(!['running','completed','failed'].includes(status)) return res.status(400).json({success:false,code:'INVALID_COMMAND_STATUS',error:'Invalid command status.'})
    const command=db.prepare('SELECT * FROM remote_commands WHERE id=?').get(req.params.id)
    if(!command) return res.status(404).json({success:false,code:'COMMAND_NOT_FOUND',error:'Command not found.'})
    if(String(command.pc_id)!==String(req.pc.id)) return res.status(403).json({success:false,code:'COMMAND_PC_MISMATCH',error:'This command belongs to another station.'})
    const transition=transitionRemoteCommand(command.id,status,result)
    publishRemoteCommandTransition(transition,result)
    res.json({success:true})
  } catch(error) { next(error) }
})

// Authenticated command mutation is staff-only. Customer stations acknowledge
// commands through the station-paired /public/remote-commands/:id boundary.
router.patch('/remote-commands/:id',auth,requireRole('admin'),(req,res,next)=>{
  try{
    const {status,result=null}=req.body??{}
    if(!['running','completed','failed'].includes(status)) return res.status(400).json({success:false,code:'INVALID_COMMAND_STATUS',error:'Invalid command status.'})
    const r=db.prepare('SELECT * FROM remote_commands WHERE id=?').get(req.params.id)
    if(!r)return res.status(404).json({success:false,code:'COMMAND_NOT_FOUND',error:'Command not found.'})
    const transition=transitionRemoteCommand(r.id,status,result)
    publishRemoteCommandTransition(transition,result)
    res.json({success:true})
  }catch(e){next(e)}
})

router.get('/pos/products',auth,(req,res)=>res.json({success:true,products:db.prepare('SELECT * FROM pos_products WHERE is_active=1 ORDER BY category,name').all()}))

router.post('/pos/products',auth,requireRole('admin'),(req,res,next)=>{
  try{
    const{name,category='Food',price,stock=null}=req.body??{}
    const cleanName=String(name??'').trim()
    const numericPrice=Number(price)
    if(!cleanName||!Number.isFinite(numericPrice)||numericPrice<0)return res.status(400).json({success:false,code:'INVALID_PRODUCT',error:'Product name and valid price are required.'})
    const numericStock=stock==null||stock===''?null:Number(stock)
    if(numericStock!==null && (!Number.isInteger(numericStock)||numericStock<0))return res.status(400).json({success:false,code:'INVALID_STOCK',error:'Stock must be a whole number zero or greater.'})
    const now=nowIso(),product={id:id(),name:cleanName,category:String(category||'Food').trim()||'Food',price:numericPrice,stock:numericStock,is_active:1,created_at:now,updated_at:now}
    db.prepare('INSERT INTO pos_products(id,name,category,price,stock,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(product.id,product.name,product.category,product.price,product.stock,1,now,now)
    emitDataChanged({method:'POST',path:'/pos/products'})
    res.status(201).json({success:true,product})
  }catch(e){next(e)}
})

function restorePosReservation(order, transactionType='pos_cancel', completedBy=null) {
  if(order.payment_method==='wallet'&&order.member_id){
    const member=db.prepare('SELECT wallet_balance FROM members WHERE id=?').get(order.member_id)
    if(member){
      const before=Number(member.wallet_balance),after=before+Number(order.total)
      db.prepare('UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?').run(after,nowIso(),order.member_id)
      db.prepare('INSERT INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id(),order.member_id,transactionType,Number(order.total),before,after,'pos_order',order.id,nowIso())
    }
  }
  const items=db.prepare('SELECT product_id,quantity FROM pos_order_items WHERE order_id=?').all(order.id)
  for(const item of items) db.prepare('UPDATE pos_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+? END,updated_at=? WHERE id=?').run(item.quantity,nowIso(),item.product_id)
  db.prepare("UPDATE pos_orders SET status='cancelled',completed_at=?,completed_by=? WHERE id=? AND status='pending'").run(nowIso(),completedBy,order.id)
  return {...order,status:'cancelled'}
}

function expirePendingPosOrders() {
  const now=nowIso()
  const due=db.prepare("SELECT * FROM pos_orders WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=?").all(now)
  const expired=[]
  for(const candidate of due){
    const result=transaction(()=>{
      const order=db.prepare("SELECT * FROM pos_orders WHERE id=? AND status='pending'").get(candidate.id)
      if(!order||!order.expires_at||order.expires_at>now)return null
      return restorePosReservation(order,'pos_expired',null)
    })
    if(result){
      expired.push(result)
      if(result.member_id&&result.payment_method==='wallet'){
        const balance=db.prepare('SELECT wallet_balance FROM members WHERE id=?').get(result.member_id)?.wallet_balance
        emitWalletUpdated(result.member_id,{balance:Number(balance??0),reason:'pos_expired'})
      }
    }
  }
  return expired
}

router.post('/pos/orders',auth,(req,res,next)=>{
  try{
    expirePendingPosOrders()
    const{items=[],paymentMethod='wallet',pcId=req.auth.pcId??null}=req.body??{}
    if(!Array.isArray(items)||!items.length)return res.status(400).json({success:false,code:'INVALID_ORDER',error:'At least one item is required.'})
    if(!['wallet','cash'].includes(paymentMethod))return res.status(400).json({success:false,code:'INVALID_PAYMENT_METHOD',error:'Invalid payment method.'})
    if(req.auth.role==='customer' && String(pcId??'')!==String(req.auth.pcId??''))return res.status(403).json({success:false,code:'SESSION_PC_MISMATCH',error:'Orders must be placed from this PC.'})

    const result=transaction(()=>{
      const memberId=req.auth.role==='customer'?req.auth.memberId:(req.body.memberId??null)
      const products=items.map(i=>{
        const p=db.prepare('SELECT * FROM pos_products WHERE id=? AND is_active=1').get(i.productId)
        if(!p)throw Object.assign(new Error('Product not found.'),{status:404,code:'PRODUCT_NOT_FOUND',expose:true})
        const q=Number(i.quantity)
        if(!Number.isInteger(q)||q<=0)throw Object.assign(new Error(`Invalid quantity for ${p.name}.`),{status:400,code:'INVALID_ORDER',expose:true})
        if(p.stock!=null&&p.stock<q)throw Object.assign(new Error(`Insufficient stock for ${p.name}.`),{status:409,code:'INSUFFICIENT_STOCK',expose:true})
        return{...p,q,sub:Number(p.price)*q}
      })
      const total=products.reduce((a,p)=>a+p.sub,0)
      const orderId=id(), createdAt=nowIso(), expiresAt=new Date(Date.now()+POS_ORDER_RESERVATION_MS).toISOString()
      if(paymentMethod==='wallet'){
        if(!memberId)throw Object.assign(new Error('Wallet payment requires a member account.'),{status:400,code:'MEMBER_REQUIRED',expose:true})
        const m=db.prepare('SELECT wallet_balance FROM members WHERE id=?').get(memberId)
        if(!m||Number(m.wallet_balance)<total)throw Object.assign(new Error('Insufficient wallet balance.'),{status:400,code:'INSUFFICIENT_BALANCE',expose:true})
        const before=Number(m.wallet_balance),after=before-total
        db.prepare('UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?').run(after,createdAt,memberId)
        db.prepare('INSERT INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(id(),memberId,'pos_order',-total,before,after,'pos_order',orderId,createdAt)
      }
      db.prepare("INSERT INTO pos_orders(id,member_id,pc_id,total,payment_method,status,created_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?)").run(orderId,memberId,pcId,total,paymentMethod,createdAt,expiresAt)
      const st=db.prepare('INSERT INTO pos_order_items(id,order_id,product_id,quantity,unit_price,subtotal) VALUES(?,?,?,?,?,?)')
      for(const p of products){st.run(id(),orderId,p.id,p.q,p.price,p.sub);if(p.stock!=null)db.prepare('UPDATE pos_products SET stock=stock-?,updated_at=? WHERE id=?').run(p.q,createdAt,p.id)}
      return{orderId,total,memberId,expiresAt}
    })

    if(result.memberId && paymentMethod==='wallet') {
      const balance=db.prepare('SELECT wallet_balance FROM members WHERE id=?').get(result.memberId)?.wallet_balance
      emitWalletUpdated(result.memberId,{balance:Number(balance??0),reason:'pos_order'})
    }
    emitToStaff('pos:order',result)
    res.status(201).json({success:true,orderId:result.orderId,total:result.total,status:'pending',expiresAt:result.expiresAt})
  }catch(e){next(e)}
})

router.get('/pos/orders',auth,requireRole('admin'),(req,res)=>{
  expirePendingPosOrders()
  res.json({success:true,orders:db.prepare('SELECT o.*,m.name customer_name,p.label pc_label FROM pos_orders o LEFT JOIN members m ON m.id=o.member_id LEFT JOIN pcs p ON p.id=o.pc_id ORDER BY o.created_at DESC').all()})
})

router.patch('/pos/orders/:id/complete',auth,requireRole('admin'),(req,res,next)=>{
  try{
    expirePendingPosOrders()
    const current=db.prepare('SELECT * FROM pos_orders WHERE id=?').get(req.params.id)
    if(!current) return res.status(404).json({success:false,code:'ORDER_NOT_FOUND',error:'Order not found.'})
    if(current.status==='cancelled'&&current.expires_at&&current.expires_at<=nowIso()) return res.status(409).json({success:false,code:'POS_ORDER_EXPIRED',error:'This order reservation expired and its stock was released.'})
    const order=transaction(()=>{
      const row=db.prepare('SELECT * FROM pos_orders WHERE id=?').get(req.params.id)
      if(row.status==='completed')return row
      if(row.status!=='pending')throw Object.assign(new Error('Only pending orders can be completed.'),{status:409,code:'ORDER_NOT_PENDING',expose:true})
      const changed=db.prepare("UPDATE pos_orders SET status='completed',completed_at=?,completed_by=? WHERE id=? AND status='pending'").run(nowIso(),req.auth.userId,row.id)
      if(changed.changes!==1)throw Object.assign(new Error('Order state changed before completion.'),{status:409,code:'ORDER_STATE_CONFLICT',expose:true})
      recordPosRevenue(row,req.auth.userId)
      return{...row,status:'completed'}
    })
    res.json({success:true,order})
  }catch(error){next(error)}
})

router.patch('/pos/orders/:id/cancel',auth,requireRole('admin'),(req,res,next)=>{
  try{
    expirePendingPosOrders()
    const current=db.prepare('SELECT * FROM pos_orders WHERE id=?').get(req.params.id)
    if(!current)return res.status(404).json({success:false,code:'ORDER_NOT_FOUND',error:'Order not found.'})
    if(current.status==='cancelled'&&current.expires_at&&current.expires_at<=nowIso())return res.status(409).json({success:false,code:'POS_ORDER_EXPIRED',error:'This order reservation already expired and was released.'})
    const result=transaction(()=>{
      const order=db.prepare('SELECT * FROM pos_orders WHERE id=?').get(req.params.id)
      if(order.status==='cancelled')return{order,alreadyCancelled:true}
      if(order.status!=='pending')throw Object.assign(new Error('Only pending orders can be cancelled.'),{status:409,code:'ORDER_NOT_PENDING',expose:true})
      return{order:restorePosReservation(order,'pos_cancel',req.auth.userId)}
    })
    if(result.order.member_id&&result.order.payment_method==='wallet'){
      const balance=db.prepare('SELECT wallet_balance FROM members WHERE id=?').get(result.order.member_id)?.wallet_balance
      emitWalletUpdated(result.order.member_id,{balance:Number(balance??0),reason:'pos_cancel'})
    }
    res.json({success:true,...result})
  }catch(error){next(error)}
})

router.post('/support/messages',auth,(req,res,next)=>{
  try{
    const{message}=req.body??{}
    if(!message?.trim())return res.status(400).json({success:false,code:'INVALID_MESSAGE',error:'Message is required.'})
    const pcId=req.auth.role==='customer'?req.auth.pcId:(req.body.pcId??null)
    if(req.auth.role==='customer' && !pcId)return res.status(403).json({success:false,code:'PC_NOT_REGISTERED',error:'This PC is not registered with the cafe server.'})
    const row={id:id(),memberId:req.auth.role==='customer'?req.auth.memberId:null,pcId,senderRole:req.auth.role,message:String(message).trim().slice(0,500),status:'open',createdAt:nowIso()}
    db.prepare('INSERT INTO support_messages(id,member_id,pc_id,sender_role,message,status,created_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.memberId,row.pcId,row.senderRole,row.message,row.status,row.createdAt)
    emitToStaff('support:new_request',row)
    emitDataChanged({method:'POST',path:'/support/messages'})
    res.status(201).json({success:true,message:row})
  }catch(e){next(e)}
})

router.get('/support/messages',auth,(req,res)=>{
  const rows=req.auth.role==='customer'
    ? db.prepare('SELECT * FROM support_messages WHERE member_id=? ORDER BY created_at ASC').all(req.auth.memberId)
    : db.prepare('SELECT * FROM support_messages ORDER BY created_at DESC LIMIT 200').all()
  res.json({success:true,messages:rows})
})

router.get('/loyalty/me',auth,(req,res)=>{const a=req.auth.memberId?db.prepare('SELECT * FROM loyalty_accounts WHERE member_id=?').get(req.auth.memberId):null;res.json({success:true,loyalty:a??{points:0,xp:0}})})

router.post('/loyalty/award',auth,requireRole('admin'),(req,res,next)=>{
  try{
    const{memberId,points=0,xp=0,reason='manual',referenceType=null,referenceId=null}=req.body??{}
    if(!db.prepare('SELECT id FROM members WHERE id=?').get(memberId))return res.status(404).json({success:false,code:'MEMBER_NOT_FOUND',error:'Member not found.'})
    const p=Number(points),x=Number(xp)
    if(!Number.isInteger(p)||!Number.isInteger(x))return res.status(400).json({success:false,code:'INVALID_LOYALTY_VALUE',error:'Points and XP must be whole numbers.'})
    transaction(()=>{const now=nowIso();db.prepare('INSERT INTO loyalty_accounts(member_id,points,xp,updated_at) VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET points=points+excluded.points,xp=xp+excluded.xp,updated_at=excluded.updated_at').run(memberId,p,x,now);db.prepare('INSERT INTO loyalty_transactions(id,member_id,points,xp,reason,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id(),memberId,p,x,reason,referenceType,referenceId,now)})
    emitDataChanged({method:'POST',path:'/loyalty/award'})
    res.status(201).json({success:true})
  }catch(e){next(e)}
})

export default router
