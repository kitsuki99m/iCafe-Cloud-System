const CLOUD_MODE =
  String(import.meta.env.VITE_ADMIN_MODE || "").toLowerCase() === "cloud";
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(
  /\/+$/,
  "",
);
const PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "",
);
const SESSION_KEY = "aezakmi.cloud.session.v1";
const BRANCH_KEY = "aezakmi.cloud.branch_id";
const ORG_KEY = "aezakmi.cloud.organization_id";
const INVITE_SETUP_KEY = "aezakmi.cloud.invite_setup.v1";
let refreshInFlight = null;
const restReadCache = new Map();
const restReadInFlight = new Map();
const subscriptionReadCache = new Map();
let developerListCache = null;
let developerListInFlight = null;
let userReadCache = null;
let userReadInFlight = null;

export function cloudInvalidateReadCache() {
  restReadCache.clear();
  restReadInFlight.clear();
  subscriptionReadCache.clear();
  developerListCache = null;
  developerListInFlight = null;
  userReadCache = null;
  userReadInFlight = null;
}

export function isCloudAdmin() {
  return CLOUD_MODE;
}
export function cloudConfigReady() {
  return Boolean(SUPABASE_URL && PUBLISHABLE_KEY);
}
function configError() {
  const e = new Error(
    "Cloud Admin is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel.",
  );
  e.code = "CLOUD_CONFIG_MISSING";
  return e;
}
function headers(extra = {}) {
  if (!cloudConfigReady()) throw configError();
  return { apikey: PUBLISHABLE_KEY, ...extra };
}
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
function saveSession(value) {
  cloudInvalidateReadCache();
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
}
function expired(session) {
  return (
    !session?.access_token ||
    !session?.expires_at ||
    Number(session.expires_at) * 1000 < Date.now() + 30_000
  );
}
async function parse(response) {
  let data = null;

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    const message =
      data?.message ||
      data?.msg ||
      data?.error_description ||
      (typeof data?.error === "string" ? data.error : data?.error?.message) ||
      `Cloud request failed (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code || data?.error_code || data?.error?.code || null;
    error.data = data;

    throw error;
  }

  return data;
}
export function cloudConsumeAuthCallback() {
  if (!CLOUD_MODE || typeof window === "undefined") return null;
  const raw = String(window.location.hash || "").replace(/^#/, "");
  if (!raw.includes("access_token=")) return null;
  const params = new URLSearchParams(raw.startsWith("/") ? raw.slice(1) : raw);
  const accessToken = params.get("access_token"),
    refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const expiresIn = Number(params.get("expires_in") || 3600),
    type = params.get("type") || "";
  saveSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get("token_type") || "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  });
  if (type === "invite" || (type === "recovery" && new URLSearchParams(window.location.search).get("aezakmi") === "activate")) localStorage.setItem(INVITE_SETUP_KEY, "1");
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}#/`,
  );
  return type;
}
export function cloudInvitationSetupPending() {
  return localStorage.getItem(INVITE_SETUP_KEY) === "1";
}
export function cloudClearInvitationSetup() {
  localStorage.removeItem(INVITE_SETUP_KEY);
}

export async function cloudSignIn(email, password) {
  if (!cloudConfigReady()) throw configError();
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email, password }),
    },
  );
  const data = await parse(response);
  saveSession({
    ...data,
    expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  });
  return data;
}
export async function cloudRefreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const current = loadSession();
    if (!current?.refresh_token)
      throw Object.assign(new Error("Cloud session expired. Sign in again."), {
        status: 401,
        code: "AUTH_REQUIRED",
      });
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      },
    );
    const data = await parse(response);
    const next = {
      ...current,
      ...data,
      refresh_token: data.refresh_token || current.refresh_token,
      expires_at:
        Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    };
    saveSession(next);
    return next;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
export async function cloudSession() {
  let session = loadSession();
  if (expired(session)) {
    try {
      session = await cloudRefreshSession();
    } catch {
      saveSession(null);
      return null;
    }
  }
  return session;
}
export async function cloudAuthHeaders() {
  const session = await cloudSession();
  if (!session?.access_token)
    throw Object.assign(new Error("Sign in first."), {
      status: 401,
      code: "AUTH_REQUIRED",
    });
  return headers({
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  });
}

const CLOUD_REALTIME_TABLES = [
  "branch_stations",
  "branch_sessions",
  "branch_members",
  "branch_top_ups",
  "branch_support_requests",
  "branch_session_extensions",
  "branch_feedback",
  "branch_announcements",
  "branch_configs",
  "branch_launcher_categories",
  "branch_launcher_apps",
  "branch_menu_items",
  "branch_menu_orders",
  "branch_user_shifts",
  "branch_promo_vouchers",
];

export function startCloudRealtime({ branchId, onChange, onStatus } = {}) {
  let socket = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let stopped = false;
  let ref = 1;

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    reconnectTimer = null;
    heartbeatTimer = null;
  };
  const stop = () => {
    stopped = true;
    clearTimers();
    try { socket?.close(); } catch {}
    socket = null;
  };
  const connect = async () => {
    if (stopped || !branchId || !cloudConfigReady()) return;
    const session = await cloudSession();
    if (stopped || !session?.access_token) return;
    const wsUrl = `${SUPABASE_URL.replace(/^https:/, "wss:")}/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`;
    const current = new WebSocket(wsUrl);
    socket = current;
    const topic = `realtime:admin-branch:${branchId}`;
    const nextRef = () => String(ref++);
    current.addEventListener("open", () => {
      current.send(JSON.stringify({
        topic,
        event: "phx_join",
        payload: {
          access_token: session.access_token,
          config: {
            broadcast: { self: false, ack: false },
            presence: { enabled: false },
            postgres_changes: CLOUD_REALTIME_TABLES.map((table) => ({
              event: "*",
              schema: "public",
              table,
              filter: `branch_id=eq.${branchId}`,
            })),
          },
        },
        ref: nextRef(),
      }));
      heartbeatTimer = setInterval(() => {
        if (current.readyState === WebSocket.OPEN) {
          current.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: nextRef() }));
        }
      }, 30_000);
      onStatus?.(true);
    });
    current.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data || ""));
        if (message?.event === "postgres_changes") onChange?.(message.payload);
      } catch {}
    });
    const reconnect = () => {
      if (socket !== current || stopped) return;
      clearTimers();
      socket = null;
      onStatus?.(false);
      reconnectTimer = setTimeout(connect, 5_000);
    };
    current.addEventListener("close", reconnect);
    current.addEventListener("error", () => {
      try { current.close(); } catch {}
    });
  };
  void connect();
  return stop;
}
export async function cloudGetUser({ force = false } = {}) {
  const session=await cloudSession();
  if (!session?.access_token) throw Object.assign(new Error("Sign in first."), { status:401, code:"AUTH_REQUIRED" });
  const tokenKey=String(session.access_token);
  if (!force && userReadCache?.tokenKey===tokenKey && userReadCache.expiresAt>Date.now()) return userReadCache.value;
  if (!force && userReadInFlight?.tokenKey===tokenKey) return userReadInFlight.promise;
  const promise=(async()=>{
    const value=await parse(await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:headers({Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"}), cache:"no-store" }));
    userReadCache={tokenKey,value,expiresAt:Date.now()+5*60_000};
    return value;
  })().finally(()=>{if(userReadInFlight?.tokenKey===tokenKey)userReadInFlight=null});
  userReadInFlight={tokenKey,promise};
  return promise;
}
export async function cloudSignOut() {
  try {
    const session = loadSession();
    if (session?.access_token)
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: headers({ Authorization: `Bearer ${session.access_token}` }),
      });
  } catch {}
  saveSession(null);
  cloudClearInvitationSetup();
  localStorage.removeItem(BRANCH_KEY);
  localStorage.removeItem(ORG_KEY);
}
export async function cloudUpdatePassword(password) {
  const h = await cloudAuthHeaders();
  return parse(
    await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ password }),
    }),
  );
}
export async function cloudVerifyPassword(email, password) {
  await cloudSignIn(email, password);
  return true;
}

function restReadTtl(path) {
  if (/platform_subscription_packages|platform_pricing_settings/.test(path)) return 5 * 60_000;
  if (/branch_configs|branch_rate_plans|branch_announcements/.test(path)) return 5 * 60_000;
  if (/cloud_audit_logs|branch_revenue_events/.test(path)) return 60_000;
  if (/branch_stations|branch_sessions|branch_members|branch_top_ups|branch_support_requests|branch_session_extensions|branch_feedback/.test(path)) return 20_000;
  return 30_000;
}
async function rest(path, { method = "GET", body, force = false, cacheTtlMs = null } = {}) {
  const normalizedMethod=String(method||"GET").toUpperCase();
  const ttlMs=cacheTtlMs == null ? restReadTtl(path) : Math.max(0,Number(cacheTtlMs)||0);
  const cacheKey=`${normalizedMethod}:${path}`;
  if (normalizedMethod === "GET" && !force && ttlMs > 0) {
    const cached=restReadCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (restReadInFlight.has(cacheKey)) return restReadInFlight.get(cacheKey);
  }
  const request=(async()=>{
    const h = await cloudAuthHeaders();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method:normalizedMethod,
      headers: { ...h, Prefer: "return=representation" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const value=await parse(response);
    if (normalizedMethod === "GET" && !force && ttlMs > 0) restReadCache.set(cacheKey,{value,expiresAt:Date.now()+ttlMs});
    else if (normalizedMethod !== "GET") cloudInvalidateReadCache();
    return value;
  })();
  if (normalizedMethod === "GET" && !force && ttlMs > 0) {
    restReadInFlight.set(cacheKey,request);
    request.finally(()=>restReadInFlight.delete(cacheKey));
  }
  return request;
}
async function rpcRead(functionName, body = {}, { force = false, ttlMs = 20_000 } = {}) {
  const cacheKey=`RPC:${functionName}:${JSON.stringify(body||{})}`;
  if (!force && ttlMs>0) {
    const cached=restReadCache.get(cacheKey);
    if (cached && cached.expiresAt>Date.now()) return cached.value;
    if (restReadInFlight.has(cacheKey)) return restReadInFlight.get(cacheKey);
  }
  const request=(async()=>{
    const h=await cloudAuthHeaders();
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(functionName)}`,{method:'POST',headers:h,body:JSON.stringify(body||{})});
    const value=await parse(response);
    if (!force && ttlMs>0) restReadCache.set(cacheKey,{value,expiresAt:Date.now()+ttlMs});
    return value;
  })();
  if (!force && ttlMs>0) { restReadInFlight.set(cacheKey,request); request.finally(()=>restReadInFlight.delete(cacheKey)); }
  return request;
}

async function restCount(path) {
  const h = await cloudAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET",
    headers: { ...h, Prefer: "count=exact", Range: "0-0" },
  });
  if (!response.ok) return parse(response);
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+|\*)$/);
  return match && match[1] !== "*" ? Number(match[1]) : 0;
}
export async function cloudListMemberships(userId) {
  return rest(
    `organization_members?select=organization_id,role&user_id=eq.${encodeURIComponent(userId)}`,
  );
}
export async function cloudListOrganizations(ids = []) {
  if (!ids.length) return [];
  return rest(
    `organizations?select=id,name,lifecycle_status,lifecycle_reason,lifecycle_updated_at,suspended_at,terminated_at,created_at&id=in.(${ids.map(encodeURIComponent).join(",")})&order=name.asc`,
  );
}
export async function cloudListBranches(orgIds = []) {
  if (!orgIds.length) return [];
  return rest(
    `branches?select=id,organization_id,name,code,timezone,is_active,created_at&organization_id=in.(${orgIds.map(encodeURIComponent).join(",")})&is_active=eq.true&order=name.asc`,
  );
}
export async function cloudIsPlatformDeveloper(userId) {
  const rows = await rest(
    `platform_developers?select=user_id,email,is_active&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`,
  );
  return Boolean(rows?.[0]);
}
export async function cloudResolveAccess(userId) {
  const [memberships, platformDeveloper] = await Promise.all([
      cloudListMemberships(userId),
      cloudIsPlatformDeveloper(userId),
    ]),
    orgIds = [...new Set(memberships.map((m) => m.organization_id))],
    organizations = await cloudListOrganizations(orgIds),
    branches = await cloudListBranches(orgIds);
  let branchId = localStorage.getItem(BRANCH_KEY);
  if (!branches.some((b) => b.id === branchId))
    branchId = branches[0]?.id || null;
  const branch = branches.find((b) => b.id === branchId) || null;
  const organizationId =
    branch?.organization_id || organizations[0]?.id || null;
  if (branchId) localStorage.setItem(BRANCH_KEY, branchId);
  else localStorage.removeItem(BRANCH_KEY);
  if (organizationId) localStorage.setItem(ORG_KEY, organizationId);
  else localStorage.removeItem(ORG_KEY);
  const organization = organizations.find((o) => o.id === organizationId) || organizations[0] || null;
  return {
    memberships,
    organizations,
    branches,
    branch,
    branchId,
    organizationId,
    organization,
    organizationStatus: organization?.lifecycle_status || null,
    organizationReason: organization?.lifecycle_reason || null,
    role:
      memberships.find((m) => m.organization_id === organizationId)?.role ||
      "viewer",
    platformDeveloper,
  };
}
export function cloudBranchId() {
  return localStorage.getItem(BRANCH_KEY) || "";
}
export function cloudOrganizationId() {
  return localStorage.getItem(ORG_KEY) || "";
}
export async function cloudGetSubscriptionOverview(organizationId = cloudOrganizationId()) {
  if (!organizationId) return null;
  const cached=subscriptionReadCache.get(organizationId);
  if(cached?.value && cached.expiresAt>Date.now()) return cached.value;
  if(cached?.promise) return cached.promise;
  const promise=(async()=>{
    const [rows, packageRows, pricingRows] = await Promise.all([
      rest(`subscriptions?select=organization_id,plan,status,max_branches,max_stations,trial_ends_at,grace_until,current_period_end&organization_id=eq.${encodeURIComponent(organizationId)}&limit=1`),
      rest(`platform_subscription_packages?select=id,label,display_order,max_stations,monthly_price,price_suffix,description,is_active&is_active=eq.true&order=display_order.asc`).catch(() => []),
      rest(`platform_pricing_settings?select=currency,deployment_fee_min,deployment_fee_max,quote_valid_days&singleton=eq.true&limit=1`).catch(() => []),
    ]);
    const subscription = rows?.[0] || null;
    if (!subscription) return null;
    const branches = await rest(`branches?select=id&organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true`);
    const ids = (branches || []).map((branch) => branch.id).filter(Boolean);
    const stationCount = ids.length ? await restCount(`branch_stations?select=local_id&branch_id=in.(${ids.map(encodeURIComponent).join(",")})`) : 0;
    return {organizationId,plan:subscription.plan||"bronze",status:subscription.status||"trial",maxBranches:Number(subscription.max_branches||0),maxStations:Number(subscription.max_stations||0),stationCount:Number(stationCount||0),branchCount:Array.isArray(branches)?branches.length:0,trialEndsAt:subscription.trial_ends_at||null,graceUntil:subscription.grace_until||null,currentPeriodEnd:subscription.current_period_end||null,packageCatalog:Array.isArray(packageRows)?packageRows:[],pricingSettings:pricingRows?.[0]||null};
  })();
  subscriptionReadCache.set(organizationId,{promise,expiresAt:0});
  try{const value=await promise;subscriptionReadCache.set(organizationId,{value,expiresAt:Date.now()+60_000});return value}
  catch(error){subscriptionReadCache.delete(organizationId);throw error}
}
export function cloudSelectBranch(branch) {
  if (!branch?.id) return;
  cloudInvalidateReadCache();
  localStorage.setItem(BRANCH_KEY, branch.id);
  localStorage.setItem(ORG_KEY, branch.organization_id || "");
  window.dispatchEvent(
    new CustomEvent("aezakmi:cloud-branch-changed", { detail: branch }),
  );
}
export async function cloudCreateBranch(
  organizationId,
  name,
  timezone = "Asia/Manila",
) {
  return cloudInvoke("create-branch", { organizationId, name, timezone });
}
export async function cloudInvoke(functionName, body = {}) {
  const h = await cloudAuthHeaders();
  return parse(
    await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
    }),
  );
}
export async function cloudPublicInvoke(functionName, body = {}) {
  if (!cloudConfigReady()) throw configError();
  return parse(
    await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }),
  );
}
export async function cloudRequestBusinessAccess(payload) {
  return cloudPublicInvoke("request-business-access", payload);
}
export async function cloudRequestRegistrationCaptcha() {
  return cloudPublicInvoke("request-business-access", { action: "captcha" });
}
export async function cloudDeveloperRegistrations(
  action = "list",
  payload = {},
) {
  const normalized=String(action||"list").toLowerCase();
  if(normalized==="list"){
    if(developerListCache?.expiresAt>Date.now())return developerListCache.value;
    if(developerListInFlight)return developerListInFlight;
    developerListInFlight=cloudInvoke("developer-registrations",{action,...payload})
      .then((value)=>{developerListCache={value,expiresAt:Date.now()+60_000};return value})
      .finally(()=>{developerListInFlight=null});
    return developerListInFlight;
  }
  const value=await cloudInvoke("developer-registrations", { action, ...payload });
  cloudInvalidateReadCache();
  return value;
}
export async function cloudActivateRegistration() {
  return cloudInvoke("activate-registration", {});
}


function camelizeObject(value) {
  if (Array.isArray(value)) return value.map(camelizeObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      camelizeObject(item),
    ]),
  );
}
function epoch(value) {
  const time = value ? new Date(value).getTime() : null;
  return Number.isFinite(time) ? time : null;
}
function cloudSessionView(row) {
  if (!row) return null;
  const raw = camelizeObject(row.data || {});
  const billing = raw.billing || raw.billingType || row.billing_type || "prepaid";
  const expiresAt = epoch(row.expires_at ?? raw.expiresAt);
  const startedAt = epoch(row.started_at ?? raw.startedAt);
  const now = Date.now();
  const pausedAt = raw.pausedAt ? epoch(raw.pausedAt) : null;
  const lockValue = raw.isLocked ?? raw.isPaused;
  const isLocked = lockValue === true || lockValue === 1 || ['true','1','yes','on'].includes(String(lockValue ?? '').toLowerCase()) || (pausedAt != null && Boolean(raw.pauseReason));
  const historicalPausedSeconds = Math.max(0, Number(row.paused_seconds ?? raw.pausedSeconds ?? 0) || 0);
  const effectiveNow = isLocked && pausedAt != null ? Math.min(now, pausedAt) : now;
  const calculatedBillableSeconds = startedAt == null
    ? 0
    : Math.max(0, Math.floor((effectiveNow - Number(startedAt)) / 1000) - historicalPausedSeconds);
  const frozenBillable = Number(raw.elapsedBillableSeconds ?? raw.billableSeconds);
  const billableSeconds = billing === "postpaid" && isLocked && Number.isFinite(frozenBillable)
    ? Math.max(0, Math.floor(frozenBillable))
    : calculatedBillableSeconds;
  const frozenRemaining = Number(raw.pausedRemainingSeconds ?? raw.savedRemainingSeconds);
  const calculatedRemaining = expiresAt == null
    ? null
    : Math.max(0, Math.ceil((Number(expiresAt) - effectiveNow) / 1000));
  const remainingSeconds = billing === "prepaid"
    ? (isLocked && Number.isFinite(frozenRemaining) ? Math.max(0, Math.floor(frozenRemaining)) : calculatedRemaining)
    : null;
  const postpaidRatePerMinute = (() => {
    const value = raw.postpaidRatePerMinute ?? row.postpaid_rate_per_minute;
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  })();
  const accruedAmount = billing === "postpaid"
    ? Math.max(0, Math.round((billableSeconds / 60) * Number(postpaidRatePerMinute || 0) * 100) / 100)
    : null;
  return {
    ...raw,
    id: String(row.local_id),
    customerId: raw.customerId ?? raw.memberId ?? row.member_id ?? null,
    ratePlanId: raw.ratePlanId ?? row.rate_plan_id ?? null,
    customerName: raw.customerName ?? row.customer_name ?? "Guest",
    billing,
    amount: Number(raw.amount ?? raw.amountPaid ?? row.amount_paid ?? 0),
    prepaidSeconds: Number(raw.prepaidSeconds ?? row.prepaid_seconds ?? 0) || null,
    postpaidRatePerMinute,
    startedAt,
    expiresAt,
    status: row.status || raw.status || "active",
    isLocked,
    isPaused: isLocked,
    pausedAt,
    pauseReason: raw.pauseReason ?? null,
    pausedSeconds: historicalPausedSeconds,
    pausedRemainingSeconds: isLocked && remainingSeconds != null ? remainingSeconds : null,
    remainingSeconds,
    billableSeconds,
    elapsedBillableSeconds: billableSeconds,
    accruedAmount,
    observedAt: now,
  };
}
function cloudPcsFromRows(stations = [], sessions = []) {
  const sessionsByPc = new Map();
  for (const session of sessions || []) {
    if (!sessionsByPc.has(String(session.pc_id))) sessionsByPc.set(String(session.pc_id), session);
  }
  return (stations || []).map((row) => {
    const session = sessionsByPc.get(String(row.local_id));
    const cloudHeartbeatAgeMs = row.cloud_last_seen_at ? Date.now() - new Date(row.cloud_last_seen_at).getTime() : Number.POSITIVE_INFINITY;
    const cloudOnline = Number.isFinite(cloudHeartbeatAgeMs) && cloudHeartbeatAgeMs < 180_000;
    const cloudDegraded = cloudOnline && cloudHeartbeatAgeMs >= 90_000;
    const persistedStatus = String(row.status || "offline").toLowerCase();
    const maintenance = persistedStatus === "maintenance";
    // Session/business state and station connectivity are separate concerns. A
    // minimized/throttled Customer renderer can miss a heartbeat without ending
    // the paid session. Keep the desk In use and expose connectivity separately.
    const status = maintenance ? "maintenance" : session ? "occupied" : persistedStatus === "reserved" ? "reserved" : !cloudOnline && row.station_device_id ? "offline" : persistedStatus === "offline" ? "offline" : cloudOnline ? "available" : (row.status || "offline");
    return {
      id: String(row.local_id), pcNumber: row.pc_number ?? row.local_id, label: row.label || row.pc_number || row.local_id,
      ipAddress: row.ip_address || "", macAddress: row.mac_address || null, spec: row.spec || "", status,
      session: cloudSessionView(session), stationDeviceId: row.station_device_id || null, cloudLastSeenAt: row.cloud_last_seen_at || null,
      cloudConnectionStatus: !row.station_device_id ? "unpaired" : cloudDegraded ? "reconnecting" : cloudOnline ? "online" : "offline",
      cloudOnline, cloudDegraded, customerVersion: row.customer_version || null, edgeId: row.edge_id || null, createdAt: row.created_at || null, updatedAt: row.updated_at || null,
    };
  });
}
async function cloudPcs(branchId) {
  const encoded = encodeURIComponent(branchId);
  const [stations, sessions] = await Promise.all([
    rest(`branch_stations?select=*&branch_id=eq.${encoded}&order=pc_number.asc,label.asc`),
    rest(`branch_sessions?select=*&branch_id=eq.${encoded}&status=eq.active&order=started_at.desc`),
  ]);
  return cloudPcsFromRows(stations,sessions);
}

function cloudRatePlan(row) {
  const data = camelizeObject(row?.data || {});
  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  return {
    ...data,
    id: String(row.local_id ?? data.id ?? ""),
    isActive: data.isActive ?? Boolean(data.is_active ?? true),
    customerSelfService: data.customerSelfService ?? Boolean(data.customer_self_service),
    pesoUnit: optionalNumber(data.pesoUnit),
    minutesPerUnit: optionalNumber(data.minutesPerUnit),
    minAmount: optionalNumber(data.minAmount),
    amount: optionalNumber(data.amount),
    minutes: optionalNumber(data.minutes),
  };
}
function cloudMember(row) {
  return {
    id: String(row.local_id),
    memberCode: row.member_code,
    name: row.name,
    username: row.username,
    birthdate: row.birthdate,
    phone: row.phone,
    email: row.email,
    tier: row.tier || "Regular",
    wallet: Number(row.wallet_balance || 0),
    walletBalance: Number(row.wallet_balance || 0),
    sessionSecondsRemaining: Number(row.session_seconds_remaining || 0),
    status: row.status || "active",
    pcId: row.pc_id || null,
    pcIp: row.pc_ip || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
async function cloudAppData(branchId) {
  const encoded = encodeURIComponent(branchId);
  const [bundle, launcherCats, launcherApps, menuItems, menuOrders, shifts, vouchers] = await Promise.all([
    rpcRead('aezakmi_admin_app_data', { p_branch_id: branchId }, { ttlMs: 20_000 }),
    rest(`branch_launcher_categories?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=sort_order.asc,name.asc`).catch(() => []),
    rest(`branch_launcher_apps?select=*&branch_id=eq.${encoded}&is_enabled=eq.true&order=sort_order.asc,name.asc`).catch(() => []),
    rest(`branch_menu_items?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=category.asc,name.asc`).catch(() => []),
    rest(`branch_menu_orders?select=*&branch_id=eq.${encoded}&order=created_at.desc&limit=100`).catch(() => []),
    rest(`branch_user_shifts?select=*&branch_id=eq.${encoded}&order=opened_at.desc&limit=20`).catch(() => []),
    rest(`branch_promo_vouchers?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=created_at.desc`).catch(() => []),
  ]);
  const pcs = cloudPcsFromRows(bundle?.stations || [], bundle?.sessions || []);
  const memberRows = bundle?.members || [], rateRows = bundle?.ratePlans || [], topUpRows = bundle?.topUps || [], supportRows = bundle?.support || [], extensionRows = bundle?.extensions || [], announcementRows = bundle?.announcements || [];
  const members = memberRows.map(cloudMember);
  const memberMap = new Map(members.map((member) => [String(member.id), member]));
  const pcMap = new Map(pcs.map((pc) => [String(pc.id), pc]));
  const sessionMap = new Map(pcs.filter((pc) => pc.session?.id).map((pc) => [String(pc.session.id), pc.id]));
  const topUpRequests = topUpRows.filter((row) => !Boolean(row.data?.archived || row.data?.archivedAt)).map((row) => {
    const data = camelizeObject(row.data || {}), pc = pcMap.get(String(data.pcId || row.data?.pc_id || "")), member = memberMap.get(String(data.memberId || ""));
    return { id: row.local_id, status: data.status || "pending", createdAt: epoch(row.requested_at || data.requestedAt), customerId: data.memberId || null, customerName: member?.name || "Member", pcId: data.pcId || null, pcLabel: pc?.label || "Unknown PC", pcIp: pc?.ipAddress || null, amount: Number(data.amount || 0), method: data.paymentMethod || "cash", gcashNumber: data.gcashNumber || data.refNo || null };
  });
  const supportRequests = supportRows.map((row) => { const member = memberMap.get(String(row.member_id || "")), pc = pcMap.get(String(row.pc_id || "")); return { id: row.local_id, memberId: row.member_id || null, pcId: row.pc_id || null, pcLabel: pc?.label || "Unknown PC", pcIp: pc?.ipAddress || null, customerName: row.customer_name || member?.name || member?.username || "Guest", message: row.message || "Customer needs assistance.", status: row.status || "open", createdAt: epoch(row.created_at), readAt: row.read_at ? epoch(row.read_at) : null, resolvedBy: row.resolved_by || null }; });
  const extensions = extensionRows.map((row) => { const data = camelizeObject(row.data || {}), sessionId = String(data.computerSessionId || data.sessionId || ""), pcId = sessionMap.get(sessionId) || null, pc = pcMap.get(String(pcId || "")), member = memberMap.get(String(data.memberId || "")); return { ...data, id: row.local_id, sessionId: data.computerSessionId || data.sessionId || null, memberId: data.memberId || null, pcId, pcLabel: pc?.label || "Unknown PC", pcIp: pc?.ipAddress || null, customerName: member?.name || "Customer", requestedAt: row.requested_at || data.requestedAt }; });
  const config = bundle?.config && typeof bundle.config === 'object' ? bundle.config : {};

  const mappedLauncherCategories = (launcherCats || []).map((r) => ({ id: r.local_id || r.id, name: r.name, sortOrder: Number(r.sort_order || 0), isActive: Boolean(r.is_active), createdAt: r.created_at }));
  const mappedLauncherApps = (launcherApps || []).map((r) => ({ id: r.local_id || r.id, name: r.name, categoryId: r.category_id, categoryName: r.category_name || "Online Games", icon: r.icon, executablePath: r.executable_path, protocolUrl: r.protocol_url, launchArguments: r.launch_arguments, workingDirectory: r.working_directory, isEnabled: Boolean(r.is_enabled), sortOrder: Number(r.sort_order || 0), isPreset: Boolean(r.is_preset), createdAt: r.created_at, updatedAt: r.updated_at }));
  const mappedMenuItems = (menuItems || []).map((m) => ({ id: m.local_id || m.id, name: m.name, category: m.category, description: m.description, price: Number(m.price_centavos || 0) / 100, imageUrl: m.image_url, stockQuantity: m.stock_quantity != null ? Number(m.stock_quantity) : null, isAvailable: Boolean(m.is_available), isActive: Boolean(m.is_active), createdAt: m.created_at, updatedAt: m.updated_at }));
  const mappedMenuOrders = (menuOrders || []).map((r) => ({ id: r.local_id || r.id, customerId: r.customer_id, customerName: r.customer_name, pcId: r.pc_id, pcLabel: r.pc_label, items: typeof r.items_json === "string" ? JSON.parse(r.items_json) : (r.items_json || []), total: Number(r.total_centavos || 0) / 100, paymentMethod: r.payment_method, paymentStatus: r.payment_status, orderStatus: r.order_status, notes: r.notes, createdAt: r.created_at, fulfilledAt: r.fulfilled_at, cancelledAt: r.cancelled_at }));
  const openShift = (shifts || []).find((s) => !s.closed_at);
  const currentShift = openShift ? { id: openShift.local_id || openShift.id, userId: openShift.user_id, userName: openShift.user_name, userRole: openShift.user_role, openingFloat: Number(openShift.opening_float_centavos || 0) / 100, notes: openShift.notes, openedAt: openShift.opened_at } : null;
  const mappedVouchers = (vouchers || []).map((v) => ({ id: v.local_id || v.id, code: v.code, benefitType: v.benefit_type, valueAmount: v.value_amount, maxRedemptions: v.max_redemptions, currentRedemptions: v.current_redemptions, expiresAt: v.expires_at, isActive: v.is_active, createdAt: v.created_at }));

  return {
    success: true,
    pcs,
    members,
    ratePlans: rateRows.map(cloudRatePlan),
    topUpRequests,
    supportRequests,
    extensions,
    announcements: announcementRows.map((row) => ({ id: row.local_id, ...camelizeObject(row.data || {}) })),
    settings: config.settings || config || {},
    launcherCategories: mappedLauncherCategories,
    launcherApps: mappedLauncherApps,
    menuItems: mappedMenuItems,
    menuOrders: mappedMenuOrders,
    currentShift,
    vouchers: mappedVouchers,
    clientContext: { success: true, cloud: true, branchId, transport: "supabase" },
    _rawSessions: bundle?.sessions || []
  };
}

async function cloudOverview(branchId) {
  const encoded = encodeURIComponent(branchId);
  const since = new Date(Date.now() - 8 * 86400_000).toISOString();
  const [appData, revenue, feedbackRows] = await Promise.all([
    cloudAppData(branchId),
    rest(`branch_revenue_events?select=*&branch_id=eq.${encoded}&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.asc`),
    rest(`branch_feedback?select=*&branch_id=eq.${encoded}&order=created_at.desc&limit=3`),
  ]);
  const pcs=appData.pcs||[],memberRows=appData.members||[],sessions=appData._rawSessions||[];
  const stationById = new Map(pcs.map((pc) => [String(pc.id), pc]));
  const todayManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const grossRevenue = (revenue || []).filter((item) => String(item.event_type || "") !== "session_refund" && Number(item.amount_centavos || 0) > 0);
  const incomeToday = grossRevenue.filter((item) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.occurred_at)) === todayManila).reduce((sum, item) => sum + Number(item.amount_centavos || 0) / 100, 0);
  const daily = new Map();
  for (const item of grossRevenue) { const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.occurred_at)); daily.set(day, (daily.get(day) || 0) + Number(item.amount_centavos || 0) / 100); }
  return {
    success:true,
    summary:{available:pcs.filter((pc)=>pc.status==="available").length,inUse:pcs.filter((pc)=>pc.status==="occupied").length,maintenance:pcs.filter((pc)=>pc.status==="maintenance").length,offline:pcs.filter((pc)=>pc.status==="offline").length,reserved:pcs.filter((pc)=>pc.status==="reserved").length,incomeToday},
    active:sessions.map((row)=>({...row,id:row.local_id,pc_label:stationById.get(String(row.pc_id))?.label||row.pc_id,username:memberRows.find((m)=>String(m.id)===String(row.member_id))?.username||null})),
    analytics:[...daily.entries()].map(([day,value])=>({day,revenue:value})),
    feedback:(feedbackRows||[]).map((row)=>({id:row.local_id,...camelizeObject(row.data||{}),created_at:row.created_at})),
    announcements:(appData.announcements||[]).slice(0,3),topCustomers:[],birthdays:memberRows.filter((row)=>row.birthdate).map((row)=>({id:row.id,username:row.username,name:row.name,birthdate:row.birthdate})),
  };
}

async function cloudDirectRead(path, branchId) {
  const url = new URL(path, "https://aezakmi.local");
  const route = url.pathname;
  const encoded = encodeURIComponent(branchId);
  const commandStatusMatch = route.match(/^\/remote-commands\/([^/]+)$/);
  if (commandStatusMatch) return cloudStationAdmin("command_status", { branchId, commandId:decodeURIComponent(commandStatusMatch[1]) });
  const settlementPreviewMatch = route.match(/^\/sessions\/([^/]+)\/settlement-preview$/);
  if (settlementPreviewMatch) return cloudStationAdmin("session_preview", { branchId, sessionId:decodeURIComponent(settlementPreviewMatch[1]) });
  if (route === "/app-data") return cloudAppData(branchId);
  if (route === "/pcs") return { success: true, pcs: await cloudPcs(branchId) };
  if (route === "/members") {
    const rows = await rest(`branch_members?select=*&branch_id=eq.${encoded}&order=name.asc`);
    return { success: true, members: (rows || []).map(cloudMember) };
  }
  if (route === "/rate-plans") {
    const rows = await rest(`branch_rate_plans?select=*&branch_id=eq.${encoded}&order=updated_at.desc`);
    return { success: true, ratePlans: (rows || []).map(cloudRatePlan) };
  }
  if (route === "/client/context") return { success: true, cloud: true, branchId, transport: "supabase" };
  if (route === "/top-ups") {
    const [rows, members, pcs] = await Promise.all([
      rest(`branch_top_ups?select=*&branch_id=eq.${encoded}&order=requested_at.desc`),
      rest(`branch_members?select=local_id,name&branch_id=eq.${encoded}`),
      cloudPcs(branchId),
    ]);
    const memberMap = new Map((members || []).map((m) => [String(m.local_id), m.name]));
    const pcMap = new Map(pcs.map((pc) => [String(pc.id), pc]));
    return { success: true, topUpRequests: (rows || []).filter((row) => !Boolean(row.data?.archived || row.data?.archivedAt)).map((row) => {
      const data = camelizeObject(row.data || {}), pc = pcMap.get(String(data.pcId || row.data?.pc_id || ""));
      return { id: row.local_id, status: data.status || "pending", createdAt: epoch(row.requested_at || data.requestedAt), customerId: data.memberId || null, customerName: memberMap.get(String(data.memberId || "")) || "Member", pcId: data.pcId || null, pcLabel: pc?.label || "Unknown PC", pcIp: pc?.ipAddress || null, amount: Number(data.amount || 0), method: data.paymentMethod || "cash", gcashNumber: data.gcashNumber || data.refNo || null };
    }) };
  }
  if (route === "/support") {
    const [rows, members, pcs] = await Promise.all([
      rest(`branch_support_requests?select=*&branch_id=eq.${encoded}&order=created_at.desc`),
      rest(`branch_members?select=local_id,name,username&branch_id=eq.${encoded}`),
      cloudPcs(branchId),
    ]);
    const memberMap = new Map((members || []).map((m) => [String(m.local_id), m]));
    const pcMap = new Map(pcs.map((pc) => [String(pc.id), pc]));
    return { success:true, supportRequests:(rows || []).map((row) => {
      const member = memberMap.get(String(row.member_id || "")), pc = pcMap.get(String(row.pc_id || ""));
      return { id:row.local_id, memberId:row.member_id || null, pcId:row.pc_id || null, pcLabel:pc?.label || "Unknown PC", pcIp:pc?.ipAddress || null, customerName:row.customer_name || member?.name || member?.username || "Guest", message:row.message || "Customer needs assistance.", status:row.status || "open", createdAt:epoch(row.created_at), readAt:row.read_at ? epoch(row.read_at) : null, resolvedBy:row.resolved_by || null };
    }) };
  }
  if (route === "/session-extensions") {
    const [rows, pcs, members, sessions] = await Promise.all([
      rest(`branch_session_extensions?select=*&branch_id=eq.${encoded}&order=requested_at.desc`),
      cloudPcs(branchId),
      rest(`branch_members?select=local_id,name&branch_id=eq.${encoded}`),
      rest(`branch_sessions?select=local_id,pc_id&branch_id=eq.${encoded}`),
    ]);
    const pcMap = new Map(pcs.map((pc) => [String(pc.id), pc])), memberMap = new Map((members || []).map((m) => [String(m.local_id), m.name])), sessionMap = new Map((sessions || []).map((s) => [String(s.local_id), s.pc_id]));
    return { success: true, extensions: (rows || []).map((row) => { const data=camelizeObject(row.data || {}), pcId=sessionMap.get(String(data.computerSessionId || "")) || null, pc=pcMap.get(String(pcId)); return { ...data, id:row.local_id, sessionId:data.computerSessionId || null, memberId:data.memberId || null, pcId, pcLabel:pc?.label || "Unknown PC", pcIp:pc?.ipAddress || null, customerName:memberMap.get(String(data.memberId || "")) || "Customer", requestedAt:row.requested_at || data.requestedAt }; }) };
  }
  if (route === "/settings") {
    const rows = await rest(`branch_configs?select=config,version,updated_at&branch_id=eq.${encoded}&limit=1`);
    const config = rows?.[0]?.config || {};
    return { success: true, settings: config.settings || config || {} };
  }
  if (route === "/announcements") {
    const rows = await rest(`branch_announcements?select=*&branch_id=eq.${encoded}&order=updated_at.desc`);
    return { success: true, announcements: (rows || []).map((row) => ({ id:row.local_id, ...camelizeObject(row.data || {}) })) };
  }
  if (route === "/dashboard/overview") return cloudOverview(branchId);
  if (route === "/logs") {
    const rows = await rest(`cloud_audit_logs?select=*&branch_id=eq.${encoded}&order=created_at.desc&limit=500`);
    return { success: true, logs: (rows || []).map((row) => ({ id:row.id, action:row.action, entityType:row.entity_type || row.details?.entityType || "cloud", entityId:row.entity_id || row.details?.entityId || null, pcId:row.details?.pcId || row.details?.stationId || null, details:row.details || {}, createdAt:row.created_at })) };
  }
  if (route === "/feedback") {
    const archived = url.searchParams.get("archived") === "1";
    const status = ["resolved", "unresolved"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : null;
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const [rows, members, pcs] = await Promise.all([
      rest(`branch_feedback?select=*&branch_id=eq.${encoded}&order=created_at.desc`),
      rest(`branch_members?select=local_id,username,name&branch_id=eq.${encoded}`),
      cloudPcs(branchId),
    ]);
    const memberMap = new Map((members || []).map((m) => [String(m.local_id), m]));
    const pcMap = new Map(pcs.map((pc) => [String(pc.id), pc]));
    let normalized = (rows || []).map((row) => {
      const data = camelizeObject(row.data || {}), memberId=data.memberId || row.data?.member_id || null, pcId=data.pcId || row.data?.pc_id || null;
      const member=memberMap.get(String(memberId || "")), pc=pcMap.get(String(pcId || ""));
      const isArchived=Boolean(data.archived || data.archivedAt || row.data?.archived_at), itemStatus=String(data.status || "unresolved");
      return { id:row.local_id, ...data, member_id:memberId, pc_id:pcId, username:member?.username || null, customer_name:data.customerName || row.data?.customer_name || member?.name || "Guest", pc_label:pc?.label || null, account_count:1, status:itemStatus, archived:isArchived, archived_at:data.archivedAt || row.data?.archived_at || null, created_at:row.created_at || data.createdAt || row.data?.created_at || null, createdAt:row.created_at || data.createdAt || row.data?.created_at || null };
    });
    normalized = normalized.filter((item) => Boolean(item.archived) === archived && (!status || item.status === status));
    const total=normalized.length, start=(page-1)*limit, items=normalized.slice(start,start+limit);
    return { success:true, feedback:items, items, pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}, total, page, pages:Math.max(1,Math.ceil(total/limit)) };
  }
  if (route === "/launcher/categories") {
    const rows = await rest(`branch_launcher_categories?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=sort_order.asc,name.asc`);
    return {
      success: true,
      categories: (rows || []).map((r) => ({
        id: r.local_id || r.id,
        name: r.name,
        sortOrder: Number(r.sort_order || 0),
        isActive: Boolean(r.is_active),
        createdAt: r.created_at,
      }))
    };
  }
  if (route === "/launcher/apps") {
    const rows = await rest(`branch_launcher_apps?select=*&branch_id=eq.${encoded}&is_enabled=eq.true&order=sort_order.asc,name.asc`);
    return {
      success: true,
      apps: (rows || []).map((r) => ({
        id: r.local_id || r.id,
        name: r.name,
        categoryId: r.category_id,
        categoryName: r.category_name || "Online Games",
        icon: r.icon,
        executablePath: r.executable_path,
        protocolUrl: r.protocol_url,
        launchArguments: r.launch_arguments,
        workingDirectory: r.working_directory,
        isEnabled: Boolean(r.is_enabled),
        sortOrder: Number(r.sort_order || 0),
        isPreset: Boolean(r.is_preset),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    };
  }
  if (route === "/menu-items") {
    const rows = await rest(`branch_menu_items?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=category.asc,name.asc`);
    return {
      success: true,
      menuItems: (rows || []).map((m) => ({
        id: m.local_id || m.id,
        name: m.name,
        category: m.category,
        description: m.description,
        price: Number(m.price_centavos || 0) / 100,
        imageUrl: m.image_url,
        stockQuantity: m.stock_quantity != null ? Number(m.stock_quantity) : null,
        isAvailable: Boolean(m.is_available),
        isActive: Boolean(m.is_active),
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }))
    };
  }
  if (route === "/menu-orders") {
    const rows = await rest(`branch_menu_orders?select=*&branch_id=eq.${encoded}&order=created_at.desc&limit=100`);
    return {
      success: true,
      orders: (rows || []).map((r) => ({
        id: r.local_id || r.id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        pcId: r.pc_id,
        pcLabel: r.pc_label,
        items: typeof r.items_json === "string" ? JSON.parse(r.items_json) : (r.items_json || []),
        total: Number(r.total_centavos || 0) / 100,
        paymentMethod: r.payment_method,
        paymentStatus: r.payment_status,
        orderStatus: r.order_status,
        notes: r.notes,
        createdAt: r.created_at,
        fulfilledAt: r.fulfilled_at,
        cancelledAt: r.cancelled_at,
      }))
    };
  }
  if (route === "/vouchers") {
    const rows = await rest(`branch_promo_vouchers?select=*&branch_id=eq.${encoded}&is_active=eq.true&order=created_at.desc`);
    return {
      success: true,
      vouchers: (rows || []).map((v) => ({
        id: v.local_id || v.id,
        code: v.code,
        benefitType: v.benefit_type,
        valueAmount: v.value_amount,
        maxRedemptions: v.max_redemptions,
        currentRedemptions: v.current_redemptions,
        expiresAt: v.expires_at,
        isActive: v.is_active,
        createdAt: v.created_at,
      }))
    };
  }
  return null;
}
export async function cloudStationAdmin(action, payload = {}) {
  const branchId = payload.branchId || cloudBranchId();
  if (!branchId) throw Object.assign(new Error("Select or create a branch first."), { status:409, code:"BRANCH_REQUIRED" });
  return cloudInvoke("station-admin", { action, branchId, ...payload });
}
async function cloudNativeMutation(path, method, body, operationKey) {
  const branchId = cloudBranchId();
  if (method === "POST" && path === "/pcs") return cloudStationAdmin("create", { branchId, station: body || {}, operationKey: operationKey || null });
  const pcMatch = path.match(/^\/pcs\/([^/?]+)$/);
  if (pcMatch && method === "PATCH") return cloudStationAdmin("update", { branchId, stationId:decodeURIComponent(pcMatch[1]), patch:body || {} });
  if (pcMatch && method === "DELETE") return cloudStationAdmin("delete", { branchId, stationId:decodeURIComponent(pcMatch[1]) });
  if (method === "POST" && path === "/remote-commands") {
    const result = await cloudStationAdmin("command", { branchId, stationId:String(body?.pcId || ""), command:String(body?.command || ""), payload:body?.payload || {}, idempotencyKey:operationKey || null });
    return { success:true, commandId:result.commandId, status:result.status, expiresAt:result.expiresAt };
  }
  const endSessionMatch = path.match(/^\/sessions\/([^/?]+)\/end$/);
  if (method === "POST" && endSessionMatch && ["save","forfeit"].includes(String(body?.disposition || "save").toLowerCase())) {
    return cloudStationAdmin("session_close", { branchId, sessionId:decodeURIComponent(endSessionMatch[1]), disposition:String(body?.disposition || "save").toLowerCase(), operationKey:operationKey || null });
  }
  const refundSessionMatch = path.match(/^\/sessions\/([^/?]+)\/refund$/);
  if (method === "POST" && refundSessionMatch) {
    return cloudStationAdmin("session_close", { branchId, sessionId:decodeURIComponent(refundSessionMatch[1]), disposition:"refund", operationKey:operationKey || null });
  }
  return null;
}

export async function cloudAdminRequest(
  path,
  { method = "GET", body, operationKey = null } = {},
) {
  const branchId = cloudBranchId();
  if (!branchId) {
    const e = new Error("Select or create a branch first.");
    e.code = "BRANCH_REQUIRED";
    e.status = 409;
    throw e;
  }
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (normalizedMethod === "GET") {
    const direct = await cloudDirectRead(path, branchId);
    if (direct !== null) return direct;
  } else {
    const native = await cloudNativeMutation(path, normalizedMethod, body, operationKey);
    if (native !== null) return native;
  }
  const result = await cloudInvoke("admin-api", {
    branchId,
    method: normalizedMethod,
    path,
    body: body ?? {},
    operationKey: operationKey || null,
  });
  if (!result?.success) {
    const error = new Error(result?.error || "Cloud Admin request failed.");
    error.status = Number(result?.status || 502);
    error.code = result?.code;
    error.data = result?.data;
    throw error;
  }
  const status = Number(result.status || 200);
  if (status >= 400) {
    const error = new Error(
      result?.data?.error || `Edge request failed (${status}).`,
    );
    error.status = status;
    error.code = result?.data?.code;
    error.data = result?.data;
    throw error;
  }
  return result.data;
}
export async function cloudGetBranchStatus() {
  const branchId = cloudBranchId();
  if (!branchId) return null;
  const rows = await rest(
    `edge_servers?select=id,status_snapshot,last_seen_at,last_sync_at,software_version,revoked_at&branch_id=eq.${encodeURIComponent(branchId)}&revoked_at=is.null&order=last_seen_at.desc&limit=1`,
  );
  return rows?.[0] || null;
}
