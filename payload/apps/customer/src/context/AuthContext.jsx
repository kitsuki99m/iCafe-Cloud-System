import { createContext, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, setToken, getToken } from "../lib/api.js";
import { cloudStationFeatureEnabled, cloudStationPaired, pairCloudStation, startCloudStationRuntime, clearCloudStationCredential } from "../lib/cloudStation.js";

const C = createContext(null);
const CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN = "aezakmi.customer.password-setup.deferred-token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setLoading] = useState(true);
  const [clientIp, setClientIp] = useState(null);
  const [passwordSetupDeferred, setPasswordSetupDeferred] = useState(false);
  const [stationPairingRequired, setStationPairingRequired] = useState(false);
  const [stationPairingError, setStationPairingError] = useState("");

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
      if (!getToken()) {
        sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
        setPasswordSetupDeferred(false);
        try {
          const d = await apiGet("/guest/session");
          if (!cancelled && d.session) {
            window.aezakmiClient?.unlockClient?.();
            setUser({
              role: "guest",
              name: d.session.customerName || "Guest",
              pcId: d.pc.id,
              pcIp: d.pc.ipAddress,
            });
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
      setStationPairingRequired(false);
      setStationPairingError("");
      setLoading(true);
      window.location.reload();
    };
    const invalid = () => {
      setStationPairingRequired(true);
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
    const clearAndLock = () => {
      setToken(null);
      sessionStorage.removeItem(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN);
      setPasswordSetupDeferred(false);
      setUser(null);
      window.aezakmiClient?.lockClient?.();
    };
    window.addEventListener("aezakmi:auth-invalid", clearAndLock);
    window.addEventListener("aezakmi:session-expired", clearAndLock);
    return () => {
      window.removeEventListener("aezakmi:auth-invalid", clearAndLock);
      window.removeEventListener("aezakmi:session-expired", clearAndLock);
    };
  }, []);

  useEffect(() => {
    if (!user || user.role === "guest" || !getToken()) return;
    const t = setInterval(
      () => apiPost("/auth/heartbeat").catch(() => {}),
      10000,
    );
    return () => clearInterval(t);
  }, [user]);

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
      setUser({
        role: "guest",
        name: d.session.customerName || "Guest",
        pcId: d.pc.id,
        pcIp: d.pc.ipAddress,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function pairStationToCloud(ownerEmail, pairingCode) {
    setStationPairingError("");
    try {
      const station = await pairCloudStation({ ownerEmail, pairingCode });
      setStationPairingRequired(false);
      return { ok:true, station };
    } catch (error) {
      setStationPairingError(error?.message || "Unable to pair this Customer Station.");
      return { ok:false, error:error?.message || "Unable to pair this Customer Station.", code:error?.code };
    }
  }

  async function resetCloudStationPairing() {
    await clearCloudStationCredential();
    setStationPairingRequired(true);
    setUser(null);
    setToken(null);
  }

  async function logout() {
    try {
      if (getToken()) await apiPost("/auth/logout");
    } catch {}
    setToken(null);
    clearDeferredPasswordSetup();
    setUser(null);
    window.aezakmiClient?.lockClient?.();
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
