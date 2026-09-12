import { createContext, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, setToken, getToken } from "../lib/api.js";

const C = createContext(null);
const CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN = "aezakmi.customer.password-setup.deferred-token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setLoading] = useState(true);
  const [clientIp, setClientIp] = useState(null);
  const [passwordSetupDeferred, setPasswordSetupDeferred] = useState(false);

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

      try {
        const data = await apiPost("/public/station/enroll");
        if (cancelled || !data.token) return;
        if (window.aezakmiClient?.setStationCredential)
          await window.aezakmiClient.setStationCredential(data.token);
        else localStorage.setItem("aezakmi.dev.station-token", data.token);
        window.dispatchEvent(new Event("aezakmi:station-enrolled"));
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
