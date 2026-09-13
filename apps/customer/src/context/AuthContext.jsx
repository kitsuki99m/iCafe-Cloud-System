import { createContext, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, setToken, getToken } from "../lib/api.js";
import { cloudStationFeatureEnabled, cloudStationPaired, pairCloudStation, startCloudStationRuntime, unpairCloudStation } from "../lib/cloudStation.js";
import { clearStationLifecycleMarker, hasPendingStationLifecycle, recoverPendingStationLifecycle, releaseStationLifecycle } from "../lib/sessionLifecycle.js";

const C = createContext(null);
const CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN = "aezakmi.customer.password-setup.deferred-token";

function guestUserFromResponse(data) {
  const session = data?.session || null;
  const pc = data?.pc || null;
  if (!session || !pc) return null;
  return {
    role:"guest",
    name: session.customerName || "Guest",
    pcId: pc.id,
    pcIp: pc.ipAddress,
    guestSession: session,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setLoading] = useState(true);
  const [clientIp, setClientIp] = useState(null);
  const [passwordSetupDeferred, setPasswordSetupDeferred] = useState(false);
  const [stationPairingRequired, setStationPairingRequired] = useState(false);
  const [stationPairingError, setStationPairingError] = useState("");
  const [stationRestartRequired, setStationRestartRequired] = useState(false);

  function clearDeferredPasswordSetup() {
    sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
    setPasswordSetupDeferred(false);
  }

  function deferredForToken(token = getToken()) {
    return Boolean(
      token &&
      sessionStorage.getItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN) === token,
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapStation() {
      if (cancelled) return;
      try {
        setClientIp(window.aezakmiClient?.getLocalIPv4?.() || null);
      } catch {}

      if (cloudStationFeatureEnabled()) {
        if (!cloudStationPaired()) {
          setStationPairingRequired(true);
          setLoading(false);
          return;
        }
        setStationPairingRequired(false);
        startCloudStationRuntime();
      }

      // Pair with the local Café Edge opportunistically so direct LAN fallback is
      // already trusted if Supabase or the ISP later goes down. This endpoint is
      // deliberately excluded from cloud proxying in api.js.
      try {
        const data = await apiPost("/public/station/enroll");
        if (!cancelled && data.token) {
          if (window.aezakmiClient?.setStationCredential)
            await window.aezakmiClient.setStationCredential(data.token);
          else localStorage.setItem("aezakmi.dev.station-token", data.token);
          window.dispatchEvent(new Event("aezakmi:station-enrolled"));
        }
      } catch {}

      if (cancelled) return;
      const recovery = await recoverPendingStationLifecycle();
      if (!recovery?.ok) {
        // Do not silently restore an old member/guest session after a crash or
        // reboot. Keep the login screen locked until Cloud/Edge can checkpoint
        // the previous session; a retry effect below finishes recovery.
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }
      if (!getToken()) {
        sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
        setPasswordSetupDeferred(false);
        try {
          const d = await apiGet("/guest/session");
          if (!cancelled && d.session) {
            window.aezakmiClient?.unlockClient?.();
            setUser(guestUserFromResponse(d));
          }
        } catch {}
        finally { if (!cancelled) setLoading(false); }
        return;
      }

      try {
        const d = await apiGet("/auth/me");
        if (!cancelled) {
          window.aezakmiClient?.unlockClient?.();
          setPasswordSetupDeferred(deferredForToken());
          setUser(d.user);
        }
      } catch {
        setToken(null);
        sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
        if (!cancelled) {
          setPasswordSetupDeferred(false);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrapStation();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const paired = () => {
      // Do not hot-reload immediately after replacing the station identity.
      // Keep the pairing shell mounted and require a clean Electron relaunch so
      // Cloud runtime, local Edge enrollment, and auth bootstrap all start from
      // the same persisted credential.
      setStationPairingRequired(true);
      setStationPairingError("");
      setStationRestartRequired(true);
      setLoading(false);
    };
    const invalid = () => {
      setStationPairingRequired(true);
      setStationRestartRequired(false);
      setStationPairingError("Cloud pairing was revoked. Pair this PC again from the business owner's Cloud Admin.");
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("aezakmi:cloud-station-paired", paired);
    window.addEventListener("aezakmi:cloud-station-invalid", invalid);
    return () => {
      window.removeEventListener("aezakmi:cloud-station-paired", paired);
      window.removeEventListener("aezakmi:cloud-station-invalid", invalid);
    };
  }, []);

  useEffect(() => {
    const lock = () => {
      setToken(null);
      sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
      setPasswordSetupDeferred(false);
      setUser(null);
      window.aezakmiClient?.lockClient?.();
    };
    const onAuthInvalid = () => {
      if (hasPendingStationLifecycle()) releaseStationLifecycle("auth_invalid", { allowDeferred:true }).catch(() => {});
      lock();
    };
    const onAdminSessionInterruption = () => {
      // Any station interruption that prevents the customer from continuing
      // to use the PC is an immediate local logout boundary. Session billing is
      // checkpointed separately through the lifecycle endpoint / recovery marker.
      lock();
    };
    const onStationSessionInterruption = onAdminSessionInterruption;
    const onSessionExpired = () => { clearStationLifecycleMarker(); lock(); };
    window.addEventListener("aezakmi:auth-invalid", onAuthInvalid);
    window.addEventListener("aezakmi:admin-session-interruption", onStationSessionInterruption);
    window.addEventListener("aezakmi:station-session-interruption", onStationSessionInterruption);
    window.addEventListener("aezakmi:session-expired", onSessionExpired);
    return () => {
      window.removeEventListener("aezakmi:auth-invalid", onAuthInvalid);
      window.removeEventListener("aezakmi:admin-session-interruption", onStationSessionInterruption);
      window.removeEventListener("aezakmi:station-session-interruption", onStationSessionInterruption);
      window.removeEventListener("aezakmi:session-expired", onSessionExpired);
    };
  }, []);

  useEffect(() => {
    const bridge=window.aezakmiClient?.onAppExitRequested;
    if (!bridge) return undefined;
    return bridge((payload) => {
      const reason=String(payload?.reason || "app_exit").toLowerCase();
      if (hasPendingStationLifecycle()) releaseStationLifecycle(reason, { allowDeferred:true }).catch(() => {});
      if (["shutdown","restart","reboot","station_disconnect","app_exit","crash_recovery"].includes(reason)) {
        window.dispatchEvent(new CustomEvent("aezakmi:station-session-interruption", { detail:{ reason, source:"electron" } }));
      }
    });
  }, []);

  useEffect(() => {
    if (!user || user.role === "guest" || !getToken()) return;
    const t = setInterval(
      () => apiPost("/auth/heartbeat").catch(() => {}),
      10000,
    );
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    if (stationPairingRequired) return undefined;
    let cancelled=false;
    const retry = async () => {
      if (!hasPendingStationLifecycle()) return;
      const result=await recoverPendingStationLifecycle();
      if (!cancelled && result?.ok) {
        setToken(null);
        setUser(null);
      }
    };
    retry();
    const timer=setInterval(retry,5000);
    return () => { cancelled=true; clearInterval(timer); };
  }, [stationPairingRequired]);

  // Admin-started guest sessions must switch the Customer station immediately
  // into Guest mode. The login screen polls only while nobody is signed in.
  useEffect(() => {
    if (authLoading || stationPairingRequired || user) return undefined;
    let cancelled=false, running=false;
    const detect = async () => {
      if (running || hasPendingStationLifecycle()) return;
      running=true;
      try {
        const d=await apiGet("/guest/session");
        if (!cancelled && d?.session) {
          setToken(null);
          clearDeferredPasswordSetup();
          window.aezakmiClient?.unlockClient?.();
          setUser(guestUserFromResponse(d));
        }
      } catch {} finally { running=false; }
    };
    detect();
    const timer=setInterval(detect,1000);
    return () => { cancelled=true; clearInterval(timer); };
  }, [authLoading, stationPairingRequired, user]);

  async function loginCustomerCredentials(username, password) {
    try {
      const d = await apiPost("/auth/login", {
        role: "customer",
        username,
        password,
      });
      sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
      setPasswordSetupDeferred(false);
      setToken(d.token);
      window.aezakmiClient?.unlockClient?.();
      setUser(d.user);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e.message,
        code: e.code,
        status: e.status,
        data: e.data,
      };
    }
  }

  async function completeCustomerPasswordSetup(newPassword) {
    try {
      const d = await apiPost("/auth/complete-customer-password-setup", { newPassword });
      clearDeferredPasswordSetup();
      setUser(d.user);
      return { ok: true, user: d.user };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code, status: e.status };
    }
  }

  function deferCustomerPasswordSetup() {
    const token = getToken();
    if (!token) return;
    sessionStorage.setItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN, token);
    setPasswordSetupDeferred(true);
  }

  async function enterGuestMode() {
    try {
      const d = await apiGet("/guest/session");
      if (!d.session)
        return {
          ok: false,
          error:
            "No guest session is active on this PC. Please ask staff to start one.",
        };
      setToken(null);
      clearDeferredPasswordSetup();
      window.aezakmiClient?.unlockClient?.();
      setUser(guestUserFromResponse(d));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function pairStationToCloud(pairingCode) {
    setStationPairingError("");
    try {
      const station = await pairCloudStation({ pairingCode });
      setStationPairingRequired(true);
      setStationRestartRequired(true);
      setLoading(false);
      return { ok:true, station, restartRequired:true };
    } catch (error) {
      setStationPairingError(error?.message || "Unable to pair this Customer Station.");
      return { ok:false, error:error?.message || "Unable to pair this Customer Station.", code:error?.code };
    }
  }

  async function resetCloudStationPairing() {
    setStationPairingError("");
    try {
      await unpairCloudStation();
      setStationRestartRequired(false);
      setStationPairingRequired(true);
      setUser(null);
      setToken(null);
      return { ok:true };
    } catch (error) {
      const message=error?.message || "Unable to reset this Customer Station pairing. Check the internet connection and try again.";
      setStationPairingError(message);
      return { ok:false, error:message, code:error?.code };
    }
  }

  async function logout(options = {}) {
    const reason=String(options?.reason || "logout");
    const allowDeferred=Boolean(options?.allowDeferred);
    let lifecycle={ ok:true, skipped:true };
    const hadPendingLifecycle=hasPendingStationLifecycle();
    if (hadPendingLifecycle) {
      lifecycle=await releaseStationLifecycle(reason,{ allowDeferred });
      if (!lifecycle?.ok && !allowDeferred) throw lifecycle?.error || new Error("Unable to save the current session before logout.");
    }
    try {
      // /public/station/lifecycle revokes every Customer auth session for this
      // station after it checkpoints the paid session. Calling /auth/logout
      // again with that now-revoked token turns a successful logout into a
      // misleading 401 and can leave the renderer showing an error. Only use
      // the token-authenticated logout endpoint when there was no active
      // station lifecycle marker to release.
      if (getToken() && !hadPendingLifecycle && lifecycle?.ok) await apiPost("/auth/logout", { event:reason, interruptedAt:new Date().toISOString() });
    } catch (error) {
      if (!allowDeferred) throw error;
    }
    setToken(null);
    clearDeferredPasswordSetup();
    setUser(null);
    window.aezakmiClient?.lockClient?.();
    return lifecycle;
  }

  const showCustomerPasswordSetup = Boolean(
    user?.role === "customer" &&
    user.mustChangeCredentials &&
    !passwordSetupDeferred,
  );

  return (
    <C.Provider
      value={{
        user,
        authLoading,
        clientIp,
        loginCustomerCredentials,
        enterGuestMode,
        logout,
        showCustomerPasswordSetup,
        completeCustomerPasswordSetup,
        deferCustomerPasswordSetup,
        stationPairingRequired,
        stationPairingError,
        stationRestartRequired,
        pairStationToCloud,
        resetCloudStationPairing,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useAuth() {
  const c = useContext(C);
  if (!c) throw Error("useAuth must be used within AuthProvider");
  return c;
}
