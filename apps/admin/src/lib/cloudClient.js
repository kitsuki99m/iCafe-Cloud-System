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
export async function cloudGetUser() {
  const h = await cloudAuthHeaders();
  return parse(
    await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: h,
      cache: "no-store",
    }),
  );
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

async function rest(path, { method = "GET", body } = {}) {
  const h = await cloudAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...h, Prefer: "return=representation" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return parse(response);
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
export function cloudSelectBranch(branch) {
  if (!branch?.id) return;
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
export async function cloudDeveloperRegistrations(
  action = "list",
  payload = {},
) {
  return cloudInvoke("developer-registrations", { action, ...payload });
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
  const expiresAt = raw.expiresAt ?? epoch(row.expires_at);
  const startedAt = raw.startedAt ?? epoch(row.started_at);
  return {
    ...raw,
    id: String(row.local_id),
    customerId: raw.customerId ?? raw.memberId ?? row.member_id ?? null,
    ratePlanId: raw.ratePlanId ?? row.rate_plan_id ?? null,
    customerName: raw.customerName ?? row.customer_name ?? "Guest",
    billing,
    amount: Number(raw.amount ?? raw.amountPaid ?? row.amount_paid ?? 0),
    prepaidSeconds: Number(raw.prepaidSeconds ?? row.prepaid_seconds ?? 0) || null,
    postpaidRatePerMinute: (() => {
      const value = raw.postpaidRatePerMinute ?? row.postpaid_rate_per_minute;
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    })(),
    startedAt,
    expiresAt,
    status: row.status || raw.status || "active",
    remainingSeconds:
      billing === "prepaid" && expiresAt
        ? Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 1000))
        : raw.remainingSeconds ?? null,
    observedAt: Date.now(),
  };
}
async function cloudPcs(branchId) {
  const encoded = encodeURIComponent(branchId);
  const [stations, sessions] = await Promise.all([
    rest(`branch_stations?select=*&branch_id=eq.${encoded}&order=pc_number.asc,label.asc`),
    rest(`branch_sessions?select=*&branch_id=eq.${encoded}&status=eq.active&order=started_at.desc`),
  ]);
  const sessionsByPc = new Map();
  for (const session of sessions || []) {
    if (!sessionsByPc.has(String(session.pc_id))) sessionsByPc.set(String(session.pc_id), session);
  }
  return (stations || []).map((row) => {
    const session = sessionsByPc.get(String(row.local_id));
    const cloudSeen = row.cloud_last_seen_at ? Date.now() - new Date(row.cloud_last_seen_at).getTime() < 30_000 : false;
    const maintenance = String(row.status || "").toLowerCase() === "maintenance";
    const status = session ? "occupied" : maintenance ? "maintenance" : cloudSeen ? "available" : (row.status || "offline");
    return {
      id: String(row.local_id),
      pcNumber: row.pc_number ?? row.local_id,
      label: row.label || row.pc_number || row.local_id,
      ipAddress: row.ip_address || "",
      macAddress: row.mac_address || null,
      spec: row.spec || "",
      status,
      session: cloudSessionView(session),
      stationDeviceId: row.station_device_id || null,
      cloudLastSeenAt: row.cloud_last_seen_at || null,
      cloudConnectionStatus: row.cloud_connection_status || (row.station_device_id ? "offline" : "unpaired"),
      cloudOnline: cloudSeen,
      edgeId: row.edge_id || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  });
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
async function cloudOverview(branchId) {
  const encoded = encodeURIComponent(branchId);
  const since = new Date(Date.now() - 8 * 86400_000).toISOString();
  const [pcs, sessions, revenue, feedbackRows, announcementRows, memberRows] = await Promise.all([
    cloudPcs(branchId),
    rest(`branch_sessions?select=*&branch_id=eq.${encoded}&status=eq.active&order=started_at.asc`),
    rest(`branch_revenue_events?select=*&branch_id=eq.${encoded}&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.asc`),
    rest(`branch_feedback?select=*&branch_id=eq.${encoded}&order=created_at.desc&limit=3`),
    rest(`branch_announcements?select=*&branch_id=eq.${encoded}&order=updated_at.desc&limit=3`),
    rest(`branch_members?select=local_id,username,name,birthdate,wallet_balance&branch_id=eq.${encoded}`),
  ]);
  const stationById = new Map(pcs.map((pc) => [String(pc.id), pc]));
  const todayManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const incomeToday = (revenue || []).filter((item) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.occurred_at)) === todayManila).reduce((sum, item) => sum + Number(item.amount_centavos || 0) / 100, 0);
  const daily = new Map();
  for (const item of revenue || []) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.occurred_at));
    daily.set(day, (daily.get(day) || 0) + Number(item.amount_centavos || 0) / 100);
  }
  return {
    success: true,
    summary: {
      available: pcs.filter((pc) => pc.status === "available").length,
      inUse: pcs.filter((pc) => pc.status === "occupied").length,
      maintenance: pcs.filter((pc) => pc.status === "maintenance").length,
      incomeToday,
    },
    active: (sessions || []).map((row) => ({
      ...row,
      id: row.local_id,
      pc_label: stationById.get(String(row.pc_id))?.label || row.pc_id,
      username: memberRows.find((m) => String(m.local_id) === String(row.member_id))?.username || null,
    })),
    analytics: [...daily.entries()].map(([day, value]) => ({ day, revenue: value })),
    feedback: (feedbackRows || []).map((row) => ({ id: row.local_id, ...camelizeObject(row.data || {}), created_at: row.created_at })),
    announcements: (announcementRows || []).map((row) => ({ id: row.local_id, ...camelizeObject(row.data || {}) })),
    topCustomers: [],
    birthdays: (memberRows || []).filter((row) => row.birthdate).map((row) => ({ id: row.local_id, username: row.username, name: row.name, birthdate: row.birthdate })),
  };
}
async function cloudDirectRead(path, branchId) {
  const url = new URL(path, "https://aezakmi.local");
  const route = url.pathname;
  const encoded = encodeURIComponent(branchId);
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
    return { success: true, topUpRequests: (rows || []).map((row) => {
      const data = camelizeObject(row.data || {}), pc = pcMap.get(String(data.pcId || row.data?.pc_id || ""));
      return { id: row.local_id, status: data.status || "pending", createdAt: epoch(row.requested_at || data.requestedAt), customerId: data.memberId || null, customerName: memberMap.get(String(data.memberId || "")) || "Member", pcId: data.pcId || null, pcLabel: pc?.label || "Unknown PC", pcIp: pc?.ipAddress || null, amount: Number(data.amount || 0), method: data.paymentMethod || "cash", gcashNumber: data.refNo || null };
    }) };
  }
  if (route === "/support") return { success:true, supportRequests:[] };
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
    const rows = await rest(`branch_feedback?select=*&branch_id=eq.${encoded}&order=created_at.desc`);
    const items=(rows || []).map((row)=>({ id:row.local_id, ...camelizeObject(row.data || {}), createdAt:row.created_at }));
    return { success:true, feedback:items, items, total:items.length, page:1, pages:1 };
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
  if (method === "POST" && path === "/pcs") return cloudStationAdmin("create", { branchId, station: body || {} });
  const pcMatch = path.match(/^\/pcs\/([^/?]+)$/);
  if (pcMatch && method === "PATCH") return cloudStationAdmin("update", { branchId, stationId:decodeURIComponent(pcMatch[1]), patch:body || {} });
  if (pcMatch && method === "DELETE") return cloudStationAdmin("delete", { branchId, stationId:decodeURIComponent(pcMatch[1]) });
  if (method === "POST" && path === "/remote-commands") {
    const result = await cloudStationAdmin("command", { branchId, stationId:String(body?.pcId || ""), command:String(body?.command || ""), payload:body?.payload || {}, idempotencyKey:operationKey || null });
    return { success:true, commandId:result.commandId, status:result.status, expiresAt:result.expiresAt };
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
