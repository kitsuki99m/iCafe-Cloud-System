const CLOUD_MODE=String(import.meta.env.VITE_ADMIN_MODE||'').toLowerCase()==='cloud'
const SUPABASE_URL=String(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/+$/,'')
const PUBLISHABLE_KEY=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||'')
const SESSION_KEY='aezakmi.cloud.session.v1'
const BRANCH_KEY='aezakmi.cloud.branch_id'
const ORG_KEY='aezakmi.cloud.organization_id'
const INVITE_SETUP_KEY='aezakmi.cloud.invite_setup.v1'
let refreshInFlight=null

export function isCloudAdmin(){return CLOUD_MODE}
export function cloudConfigReady(){return Boolean(SUPABASE_URL&&PUBLISHABLE_KEY)}
function configError(){const e=new Error('Cloud Admin is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel.');e.code='CLOUD_CONFIG_MISSING';return e}
function headers(extra={}){if(!cloudConfigReady())throw configError();return{'apikey':PUBLISHABLE_KEY,...extra}}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(value){if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
function expired(session){return !session?.access_token||!session?.expires_at||Number(session.expires_at)*1000<Date.now()+30_000}
async function parse(response){let data=null;try{data=await response.json()}catch{}if(!response.ok){const error=new Error(data?.msg||data?.error_description||data?.error||`Cloud request failed (${response.status})`);error.status=response.status;error.code=data?.code||data?.error_code;error.data=data;throw error}return data}

export function cloudConsumeAuthCallback(){
  if(!CLOUD_MODE||typeof window==='undefined')return null
  const raw=String(window.location.hash||'').replace(/^#/,'')
  if(!raw.includes('access_token='))return null
  const params=new URLSearchParams(raw.startsWith('/')?raw.slice(1):raw)
  const accessToken=params.get('access_token'),refreshToken=params.get('refresh_token')
  if(!accessToken||!refreshToken)return null
  const expiresIn=Number(params.get('expires_in')||3600),type=params.get('type')||''
  saveSession({access_token:accessToken,refresh_token:refreshToken,token_type:params.get('token_type')||'bearer',expires_in:expiresIn,expires_at:Math.floor(Date.now()/1000)+expiresIn})
  if(type==='invite')localStorage.setItem(INVITE_SETUP_KEY,'1')
  window.history.replaceState({},document.title,`${window.location.pathname}${window.location.search}#/`)
  return type
}
export function cloudInvitationSetupPending(){return localStorage.getItem(INVITE_SETUP_KEY)==='1'}
export function cloudClearInvitationSetup(){localStorage.removeItem(INVITE_SETUP_KEY)}

export async function cloudSignIn(email,password){if(!cloudConfigReady())throw configError();const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({email,password})});const data=await parse(response);saveSession({...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)});return data}
export async function cloudRefreshSession(){if(refreshInFlight)return refreshInFlight;refreshInFlight=(async()=>{const current=loadSession();if(!current?.refresh_token)throw Object.assign(new Error('Cloud session expired. Sign in again.'),{status:401,code:'AUTH_REQUIRED'});const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify({refresh_token:current.refresh_token})});const data=await parse(response);const next={...current,...data,refresh_token:data.refresh_token||current.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};saveSession(next);return next})().finally(()=>{refreshInFlight=null});return refreshInFlight}
export async function cloudSession(){let session=loadSession();if(expired(session)){try{session=await cloudRefreshSession()}catch{saveSession(null);return null}}return session}
export async function cloudAuthHeaders(){const session=await cloudSession();if(!session?.access_token)throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});return headers({'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'})}
export async function cloudGetUser(){const h=await cloudAuthHeaders();return parse(await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:h,cache:'no-store'}))}
export async function cloudSignOut(){try{const session=loadSession();if(session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:headers({'Authorization':`Bearer ${session.access_token}`})})}catch{}saveSession(null);cloudClearInvitationSetup();localStorage.removeItem(BRANCH_KEY);localStorage.removeItem(ORG_KEY)}
export async function cloudUpdatePassword(password){const h=await cloudAuthHeaders();return parse(await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:h,body:JSON.stringify({password})}))}
export async function cloudVerifyPassword(email,password){await cloudSignIn(email,password);return true}

async function rest(path,{method='GET',body}={}){const h=await cloudAuthHeaders();const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{...h,'Prefer':'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return parse(response)}
export async function cloudListMemberships(userId){return rest(`organization_members?select=organization_id,role&user_id=eq.${encodeURIComponent(userId)}`)}
export async function cloudListOrganizations(ids=[]){if(!ids.length)return[];return rest(`organizations?select=id,name,created_at&id=in.(${ids.map(encodeURIComponent).join(',')})&order=name.asc`)}
export async function cloudListBranches(orgIds=[]){if(!orgIds.length)return[];return rest(`branches?select=id,organization_id,name,code,timezone,is_active,created_at&organization_id=in.(${orgIds.map(encodeURIComponent).join(',')})&is_active=eq.true&order=name.asc`)}
export async function cloudIsPlatformDeveloper(userId){const rows=await rest(`platform_developers?select=user_id,email,is_active&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`);return Boolean(rows?.[0])}
export async function cloudResolveAccess(userId){const[memberships,platformDeveloper]=await Promise.all([cloudListMemberships(userId),cloudIsPlatformDeveloper(userId)]),orgIds=[...new Set(memberships.map(m=>m.organization_id))],organizations=await cloudListOrganizations(orgIds),branches=await cloudListBranches(orgIds);let branchId=localStorage.getItem(BRANCH_KEY);if(!branches.some(b=>b.id===branchId))branchId=branches[0]?.id||null;const branch=branches.find(b=>b.id===branchId)||null;const organizationId=branch?.organization_id||organizations[0]?.id||null;if(branchId)localStorage.setItem(BRANCH_KEY,branchId);else localStorage.removeItem(BRANCH_KEY);if(organizationId)localStorage.setItem(ORG_KEY,organizationId);else localStorage.removeItem(ORG_KEY);return{memberships,organizations,branches,branch,branchId,organizationId,role:memberships.find(m=>m.organization_id===organizationId)?.role||'viewer',platformDeveloper}}
export function cloudBranchId(){return localStorage.getItem(BRANCH_KEY)||''}
export function cloudOrganizationId(){return localStorage.getItem(ORG_KEY)||''}
export function cloudSelectBranch(branch){if(!branch?.id)return;localStorage.setItem(BRANCH_KEY,branch.id);localStorage.setItem(ORG_KEY,branch.organization_id||'');window.dispatchEvent(new CustomEvent('aezakmi:cloud-branch-changed',{detail:branch}))}
export async function cloudCreateBranch(organizationId,name,timezone='Asia/Manila'){return cloudInvoke('create-branch',{organizationId,name,timezone})}
export async function cloudInvoke(functionName,body={}){const h=await cloudAuthHeaders();return parse(await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`,{method:'POST',headers:h,body:JSON.stringify(body)}))}
export async function cloudPublicInvoke(functionName,body={}){if(!cloudConfigReady())throw configError();return parse(await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`,{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(body)}))}
export async function cloudRequestBusinessAccess(payload){return cloudPublicInvoke('request-business-access',payload)}
export async function cloudDeveloperRegistrations(action='list',payload={}){return cloudInvoke('developer-registrations',{action,...payload})}
export async function cloudActivateRegistration(){return cloudInvoke('activate-registration',{})}
export async function cloudAdminRequest(path,{method='GET',body,operationKey=null}={}){const branchId=cloudBranchId();if(!branchId){const e=new Error('Select or create a branch first.');e.code='BRANCH_REQUIRED';e.status=409;throw e}const result=await cloudInvoke('admin-api',{branchId,method,path,body:body??{},operationKey:operationKey||null});if(!result?.success){const error=new Error(result?.error||'Cloud Admin request failed.');error.status=Number(result?.status||502);error.code=result?.code;error.data=result?.data;throw error}const status=Number(result.status||200);if(status>=400){const error=new Error(result?.data?.error||`Edge request failed (${status}).`);error.status=status;error.code=result?.data?.code;error.data=result?.data;throw error}return result.data}
export async function cloudGetBranchStatus(){const branchId=cloudBranchId();if(!branchId)return null;const rows=await rest(`edge_servers?select=id,status_snapshot,last_seen_at,last_sync_at,software_version,revoked_at&branch_id=eq.${encodeURIComponent(branchId)}&revoked_at=is.null&order=last_seen_at.desc&limit=1`);return rows?.[0]||null}
