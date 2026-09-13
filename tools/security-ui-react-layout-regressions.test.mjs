import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("logout side effects require the exact active auth session and never revoke every session from a stale token", () => {
  const src = read("backend/src/routes/authRoutes.js");
  const section = src.slice(
    src.indexOf("router.post('/logout'"),
    src.indexOf("router.get('/me'"),
  );
  assert.match(
    section,
    /auth_sessions[\s\S]*jwt_id=\?[\s\S]*user_id=\?[\s\S]*revoked_at IS NULL[\s\S]*expires_at>\?/,
  );
  assert.match(section, /logoutSession\?\.role === ['"]customer['"]/);
  assert.match(section, /stationCredentialMatches/);
  assert.doesNotMatch(section, /revokeUserSessions\(/);
});

test("first-run credential setup endpoint cannot rotate credentials after setup is complete", () => {
  const src = read("backend/src/routes/authRoutes.js");
  const start = src.indexOf("router.post('/setup-credentials'");
  const end = src.indexOf("router.post('/logout'", start);
  const section = src.slice(start, end);
  assert.match(section, /mustChangeCredentials/);
  assert.match(section, /CREDENTIAL_SETUP_COMPLETE/);
});

test("renderer bearer tokens are session-scoped and legacy persistent tokens are removed", () => {
  for (const app of ["admin", "customer"]) {
    const src = read(`apps/${app}/src/lib/api.js`);
    assert.match(
      src,
      /sessionStorage\.getItem\(['"]aezakmi\.auth\.token['"]\)/,
    );
    assert.match(src, /sessionStorage\.setItem\(['"]aezakmi\.auth\.token['"]/);
    assert.match(
      src,
      /localStorage\.removeItem\(['"]aezakmi\.auth\.token['"]\)/,
    );
    assert.doesNotMatch(
      src,
      /return localStorage\.getItem\(['"]aezakmi\.auth\.token['"]\)/,
    );
  }
});

test("station-bound public customer actions require the station pairing boundary", () => {
  const identity = read("backend/src/middleware/clientIdentity.js");
  const api = read("backend/src/routes/apiRoutes.js");
  assert.match(identity, /export function requirePairedStation/);
  for (const route of [
    "/public/feedback/me",
    "/public/feedback",
    "/public/support",
    "/public/top-ups",
    "/guest/session",
  ]) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      api,
      new RegExp(
        `router\\.(?:get|post)\\(\\s*["']${escaped}["']\\s*,\\s*requirePairedStation`,
      ),
    );
  }
});

test("public remote-command and emergency-control acknowledgements require paired station middleware", () => {
  const api = read("backend/src/routes/apiRoutes.js");
  const operations = read("backend/src/routes/operationsRoutes.js");
  assert.match(
    api,
    /['"]\/public\/station-control['"][\s\S]{0,100}requirePairedStation/,
  );
  assert.match(
    api,
    /router\.patch\(['"]\/public\/station-control\/:id\/ack['"],\s*requirePairedStation/,
  );
  assert.match(
    operations,
    /router\.patch\(['"]\/public\/remote-commands\/:id['"],\s*requirePairedStation/,
  );
});

test("shared dialogs trap focus, restore prior focus, and use unique accessible title ids", () => {
  for (const file of [
    "apps/admin/src/components/common/Modal.jsx",
    "apps/customer/src/components/common/Modal.jsx",
  ]) {
    const src = read(file);
    assert.match(src, /useId/);
    assert.match(src, /previousFocusedRef/);
    assert.match(src, /Tab/);
    assert.match(src, /aria-labelledby=\{titleId\}/);
  }
  const side = read("apps/admin/src/components/common/SidePanel.jsx");
  assert.match(side, /previousFocusedRef/);
  assert.match(side, /Tab/);
});

test("admin request-center mutations are guarded per request and toast timers are cleaned on unmount", () => {
  const src = read(
    "apps/admin/src/components/admin/AdminNotificationCenter.jsx",
  );
  assert.match(src, /actionBusyIds/);
  assert.match(src, /runRequestAction/);
  assert.match(src, /toastTimersRef/);
  assert.match(src, /clearTimeout/);
});

test("feedback inbox ignores stale async page or tab responses", () => {
  const src = read("apps/admin/src/components/admin/FeedbackInboxModal.jsx");
  assert.match(src, /requestSequenceRef/);
  assert.match(src, /requestId !== requestSequenceRef\.current/);
});

test("earnings data and tax estimate only commit the newest async request", () => {
  const src = read("apps/admin/src/pages/EarningsPage.jsx");
  assert.match(src, /loadSequenceRef/);
  assert.match(src, /estimateSequenceRef/);
  assert.match(src, /requestId !== loadSequenceRef\.current/);
  assert.match(src, /requestId !== estimateSequenceRef\.current/);
});

test("admin and customer data refreshes cannot commit after identity generation changes", () => {
  for (const file of [
    "apps/admin/src/context/AppDataContext.jsx",
    "apps/customer/src/context/AppDataContext.jsx",
  ]) {
    const src = read(file);
    assert.match(src, /refreshGenerationRef/);
    assert.match(src, /generation !== refreshGenerationRef\.current/);
  }
});

test("settings refresh preserves unsaved local edits instead of clobbering draft fields", () => {
  const src = read("apps/admin/src/pages/SettingsPage.jsx");
  assert.match(src, /previousServerSettingsRef/);
  assert.match(src, /previousServerSettingsRef\.current/);
  assert.match(src, /preserve/i);
});

test("rate-plan card actions have a per-plan busy guard against duplicate mutations", () => {
  const src = read("apps/admin/src/pages/TariffsPage.jsx");
  assert.match(src, /busyPlanIds/);
  assert.match(src, /setBusyPlanIds/);
  assert.match(src, /busyPlanIds\.has\(String\(p\.id\)\)/);
});

test("shared Button components default to non-submit behavior unless explicitly overridden", () => {
  for (const app of ["admin", "customer"]) {
    const src = read(`apps/${app}/src/components/common/Button.jsx`);
    assert.match(src, /type\s*=\s*['"]button['"]/);
    assert.match(src, /<button[\s\S]{0,120}type=\{type\}/);
  }
});

test("customer login collapses to one column in the final <=820px cascade and can scroll", () => {
  const css = read("apps/customer/src/index.css");
  const media = [
    ...css.matchAll(/@media\s*\(max-width:\s*820px\)\s*\{([\s\S]*?)\n\}/g),
  ];
  assert.ok(media.length >= 1);
  const final = media.at(-1)[1];
  assert.match(
    final,
    /\.customer-login-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(final, /\.customer-login-grid[\s\S]*overflow-y:\s*auto/);
});

test("admin shell keeps header outside the route scroll viewport", () => {
  const layout = read("apps/admin/src/components/layout/MainLayout.jsx");
  assert.match(layout, /admin-main[^"']*overflow-hidden/);
  assert.match(layout, /admin-route-viewport[^"']*overflow-y-auto/);
});

test("customer realtime extension ownership does not depend on stale AppData state captured by socket effects", () => {
  const src = read("apps/customer/src/context/AppDataContext.jsx");
  const start = src.indexOf("const onExtensionUpdated");
  const end = src.indexOf("const onRemoteCommand", start);
  const section = src.slice(start, end);
  assert.match(section, /sameId\(payload\?\.pcId,user\?\.pcId\)/);
  assert.doesNotMatch(section, /state\.currentClientPc/);
});

test("toast auto-dismiss timers are tracked and cleared when containers unmount", () => {
  for (const app of ["admin", "customer"]) {
    const src = read(`apps/${app}/src/components/common/ToastContainer.jsx`);
    assert.match(src, /timer(?:s)?Ref/);
    assert.match(src, /clearTimeout/);
    assert.match(src, /return\s*\(\)\s*=>/);
  }
});

test("deferred customer modal reset timers and admin power feedback timer are cleared on unmount", () => {
  for (const file of [
    "apps/customer/src/components/customer/StartSessionModal.jsx",
    "apps/customer/src/components/customer/TopUpModal.jsx",
    "apps/customer/src/components/customer/ExtendSessionModal.jsx",
  ]) {
    const src = read(file);
    assert.match(src, /resetTimerRef/);
    assert.match(src, /clearTimeout/);
  }
  const power = read("apps/admin/src/components/floor/SessionModal.jsx");
  assert.match(power, /sentTimerRef/);
  assert.match(power, /clearTimeout/);
});

test("authenticated remote-command status mutation is staff-only because stations use the paired public acknowledgement route", () => {
  const src = read("backend/src/routes/operationsRoutes.js");
  assert.match(
    src,
    /router\.patch\(['"]\/remote-commands\/:id['"],\s*auth,\s*requireRole\(['"]admin['"]\)/,
  );
});

test("first-run credential setup and privacy-lock dialogs contain keyboard focus", () => {
  const setup = read("apps/admin/src/components/auth/AdminCredentialSetup.jsx");
  assert.match(setup, /dialogRef/);
  assert.match(setup, /event\.key !== ['"]Tab['"]/);
  const layout = read("apps/admin/src/components/layout/MainLayout.jsx");
  assert.match(layout, /lockDialogRef/);
  assert.match(layout, /event\.key !== ['"]Tab['"]/);
});

test("setup-pending admin sessions cannot join the private admin Socket.IO room", () => {
  const src = read("backend/src/server.js");
  const handshake = src.slice(
    src.indexOf("io.on('connection'"),
    src.indexOf("// Guest stations"),
  );
  assert.match(handshake, /must_change_credentials/);
  assert.match(
    handshake,
    /session\.role === ['"]admin['"][\s\S]{0,160}must_change_credentials[\s\S]{0,160}disconnect\(true\)/,
  );
  const joinIndex = handshake.indexOf("socket.join('admin')");
  const gateIndex = handshake.indexOf("must_change_credentials");
  assert.ok(gateIndex >= 0 && joinIndex > gateIndex);
});

test("admin PIN + Password mode requires both factors and PIN-only setup does not retain the bootstrap password hash", () => {
  const auth = read("backend/src/routes/authRoutes.js");
  assert.match(auth, /auth_method\s*=\s*['"]pin['"]/);
  assert.match(
    auth,
    /method === ['"]pin_password['"][\s\S]{0,1000}pin[\s\S]{0,1000}password/,
  );
  assert.match(
    auth,
    /auth_method[\s\S]{0,800}verify-admin-credentials|verify-admin-credentials[\s\S]{0,1200}auth_method/,
  );
  const setup = auth.slice(
    auth.indexOf("router.post('/setup-credentials'"),
    auth.indexOf("router.post('/logout'"),
  );
  assert.match(setup, /method===['"]pin['"]\?await argon2\.hash\(id\(\)\)/);
  const provider = read("apps/admin/src/context/AuthContext.jsx");
  assert.match(provider, /loginAdminPassword\(username,password,pin/);
  const login = read("apps/admin/src/components/auth/AdminLoginForm.jsx");
  assert.match(login, /pin_password/);
  assert.match(
    login,
    /loginAdminPassword\(\s*username\.trim\(\),\s*password,\s*mode === ["']pin_password["'] \? pin : null,\s*\)/s,
  );
});

test("privacy lock uses the configured admin auth method and requires both values for combined auth", () => {
  const layout = read("apps/admin/src/components/layout/MainLayout.jsx");
  assert.match(layout, /user\?\.authMethod/);
  assert.match(layout, /pin_password/);
  assert.match(layout, /\{pin,password\}/);
});

test("customer lock and power-warning overlays move focus off controls behind the blocking layer", () => {
  for (const file of [
    "apps/customer/src/components/common/StationLockedOverlay.jsx",
    "apps/customer/src/components/common/PowerCommandWarning.jsx",
  ]) {
    const src = read(file);
    assert.match(src, /overlayRef/);
    assert.match(src, /\.focus\(\)/);
    assert.match(src, /tabIndex=\{-1\}/);
  }
});

test("branding, overview, and backend-status polling ignore stale async responses", () => {
  for (const app of ["admin", "customer"]) {
    const branding = read(`apps/${app}/src/hooks/useBranding.js`);
    assert.match(branding, /requestSequenceRef/);
    assert.match(branding, /requestId !== requestSequenceRef\.current/);
  }
  const overview = read("apps/admin/src/pages/OverviewPage.jsx");
  assert.match(overview, /loadSequenceRef/);
  assert.match(overview, /requestId !== loadSequenceRef\.current/);
  const backendStatus = read("apps/admin/src/hooks/useBackendStatus.js");
  assert.match(backendStatus, /requestSequenceRef/);
  assert.match(backendStatus, /requestId !== requestSequenceRef\.current/);
});

test("stale branding responses cannot mutate module cache or localStorage", () => {
  for (const app of ["admin", "customer"]) {
    const src = read(`apps/${app}/src/hooks/useBranding.js`);
    const loaderStart = src.indexOf("async function loadBranding()");
    const hookStart = src.indexOf("export function useBranding()", loaderStart);
    assert.ok(loaderStart >= 0 && hookStart > loaderStart);
    const loader = src.slice(loaderStart, hookStart);
    assert.doesNotMatch(loader, /localStorage\.setItem/);
    assert.doesNotMatch(loader, /\bcached\s*=/);

    const guardIndex = src.indexOf(
      "requestId !== requestSequenceRef.current",
      hookStart,
    );
    const storageIndex = src.indexOf("localStorage.setItem", guardIndex);
    const cacheIndex = src.indexOf("cached = next", guardIndex);
    assert.ok(guardIndex >= 0, "latest-request guard is required");
    assert.ok(
      storageIndex > guardIndex,
      "localStorage persistence must happen after the latest-request guard",
    );
    assert.ok(
      cacheIndex > guardIndex,
      "module cache persistence must happen after the latest-request guard",
    );
  }
});
