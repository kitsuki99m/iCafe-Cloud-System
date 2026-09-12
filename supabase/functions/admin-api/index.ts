import{preflight}from'../_shared/cors.ts';
import{json,fail}from'../_shared/response.ts';
import{adminClient,userClient,requireMembership,projectUrl,secretKey}from'../_shared/supabase.ts';
import{broadcastWakeup}from'../_shared/edge.ts';

const METHODS=new Set(['GET','POST','PATCH','PUT','DELETE']);
const ALLOWED_ROOTS=new Set(['pcs','members','rate-plans','announcements','feedback','support','top-ups','sessions','session-extensions','transfer-requests','promos','logs','analytics','billing-policy','settings','wallet','expenses','tax-estimate','branding','remote-commands','dashboard','earnings','guest','client']);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function normalizePath(input:unknown){
  const path=String(input||'').trim();
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('..')||/^https?:/i.test(path))throw Object.assign(new Error('Invalid Admin API path.'),{status:400,code:'INVALID_PATH'});
  const root=path.split('?')[0].split('/').filter(Boolean)[0]||'';
  if(!ALLOWED_ROOTS.has(root))throw Object.assign(new Error('This Admin API path is not cloud-enabled.'),{status:403,code:'PATH_NOT_ALLOWED'});
  return path;
}

async function waitForCommand(admin:any,id:string){
  const deadline=Date.now()+18_000;
  while(Date.now()<deadline){
    const{data:current,error}=await admin.from('cloud_commands').select('status,result').eq('id',id).single();if(error)throw error;
    if(current.status==='completed')return json({success:true,commandId:id,status:Number(current.result?.status||200),data:current.result?.data??current.result??{}},200);
    if(current.status==='failed'||current.status==='expired')return json({success:false,commandId:id,status:Number(current.result?.status||502),code:current.result?.code||'EDGE_ACTION_FAILED',error:current.result?.error||'The Edge rejected the request.',data:current.result?.data??null},200);
    await sleep(180);
  }
  return json({success:false,commandId:id,status:504,code:'EDGE_TIMEOUT',error:'The branch Edge did not respond in time. The command remains auditable and may still complete.'},200);
}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o;
  try{
    const{user}=await userClient(req),admin=adminClient(),b=await req.json(),branchId=String(b.branchId||''),method=String(b.method||'GET').toUpperCase(),path=normalizePath(b.path),body=b.body&&typeof b.body==='object'?b.body:{},operationKey=String(b.operationKey||'').trim()||null;
    if(!branchId)return json({success:false,code:'BRANCH_REQUIRED',error:'Select a branch first.'},400);
    if(!METHODS.has(method))return json({success:false,code:'METHOD_NOT_ALLOWED',error:'Unsupported HTTP method.'},400);
    const{data:branch,error:branchError}=await admin.from('branches').select('id,organization_id').eq('id',branchId).single();if(branchError)throw branchError;
    await requireMembership(admin,user.id,branch.organization_id,method==='GET'?['owner','admin','manager','viewer']:['owner','admin','manager']);
    const{data:edge,error:edgeError}=await admin.from('edge_servers').select('id,realtime_topic_key,revoked_at,last_seen_at').eq('branch_id',branchId).is('revoked_at',null).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();if(edgeError)throw edgeError;
    if(!edge)return json({success:false,code:'EDGE_UNAVAILABLE',error:'No active Edge server is paired to this branch.'},503);

    if(method!=='GET'&&operationKey){
      const{data:existing,error:existingError}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).maybeSingle();if(existingError)throw existingError;
      if(existing?.id)return await waitForCommand(admin,existing.id);
    }

    const expiresAt=new Date(Date.now()+30_000).toISOString();
    const payload={organization_id:branch.organization_id,branch_id:branchId,edge_id:edge.id,command:'admin_api',payload:{method,path,body},requested_by:user.id,expires_at:expiresAt,...(method!=='GET'&&operationKey?{idempotency_key:operationKey}:{})};
    let command:any=null;
    const inserted=await admin.from('cloud_commands').insert(payload).select('id,status,requested_at,expires_at').single();
    if(inserted.error){
      if(inserted.error.code==='23505'&&operationKey){
        const{data:existing,error}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).single();if(error)throw error;command=existing;
      }else throw inserted.error;
    }else command=inserted.data;
    if(method!=='GET')await admin.from('cloud_audit_logs').insert({organization_id:branch.organization_id,branch_id:branchId,actor_user_id:user.id,action:`admin.api.${method.toLowerCase()}`,entity_type:'cloud_command',entity_id:command.id,details:{path,idempotencyKey:operationKey}});
    await broadcastWakeup(projectUrl(),secretKey(),edge.realtime_topic_key,{commandId:command.id,kind:'admin_api'});
    return await waitForCommand(admin,command.id);
  }catch(e){return fail(e,'Unable to execute Admin request.');}
});
