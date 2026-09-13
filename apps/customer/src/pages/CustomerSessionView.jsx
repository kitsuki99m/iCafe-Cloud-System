import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Zap,
  Clock,
  Wallet,
  Bell,
  LogOut,
  CheckCircle2,
  Monitor,
  PlayCircle,
  PlusCircle,
  UserRound,
  Minimize2,
  Megaphone,
  Moon,
  Sun,
  MessageSquareText,
  Power,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useAppData } from "../context/AppDataContext.jsx";
import { findPcById, rateForId, eligibleCustomerPlans, eligibleWalletStartPlans } from "../lib/rates.js";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import TopUpModal from "../components/customer/TopUpModal.jsx";
import ExtendSessionModal from "../components/customer/ExtendSessionModal.jsx";
import StartSessionModal from "../components/customer/StartSessionModal.jsx";
import { playSessionWarningVoice, playFinalSecondPing } from "../lib/sound.js";
import logo from "../assets/aktura-logo.svg";
import { useTheme } from "../context/ThemeContext.jsx";
import { useBranding } from "../hooks/useBranding.js";
import { elapsedSessionSeconds, remainingSessionSeconds, sessionWarningMinute } from "../lib/sessionTime.js";

function formatClock(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.abs(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${sign}${h > 0 ? pad(h) + ":" : ""}${pad(m)}:${pad(sec)}`;
}
function peso(n) {
  return `₱${Math.floor(Number(n || 0))}`;
}

const TIER_STYLE = {
  Regular: "text-slate-soft bg-surface-raised",
  Gold: "text-gold-dim bg-gold/10",
  VIP: "text-teal-dim bg-teal/10",
};

function AnnouncementBox({ announcements, onFeedback, birthdayAnnouncement = null }) {
  const visible = [
    ...(birthdayAnnouncement ? [birthdayAnnouncement] : []),
    ...(announcements || []),
  ].filter((item) => item.isActive !== false);

  return (
    <aside id="customer-announcements" className="customer-support-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-midnight/8 text-ink-900">
            <Megaphone size={16} />
          </span>
          <div>
            <p className="eyebrow">Cafe updates</p>
            <h2 className="font-display text-[16px] font-semibold tracking-tight text-ink-900">Announcements</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onFeedback}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-line customer-neutral-surface px-3 text-xs font-semibold text-ink-900 transition-colors hover:bg-dance/35"
        >
          <MessageSquareText size={14} />
          Feedback
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visible.length ? (
          visible.map((announcement) => (
            <article key={announcement.id} className="rounded-xl border border-surface-line customer-neutral-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-midnight/8 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {announcement.kind || "Update"}
                </span>
                <span className="text-[10px] text-slate-soft">
                  {announcement.createdAt ? new Date(announcement.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              <h3 className="mt-2 font-display text-sm font-semibold text-ink-900">{announcement.title}</h3>
              <p className="mt-1 text-[12px] leading-5 text-slate-soft">{announcement.message}</p>
            </article>
          ))
        ) : (
          <div className="flex min-h-[150px] items-center justify-center rounded-xl border border-dashed border-surface-line customer-neutral-surface px-4 text-center">
            <div>
              <p className="text-sm font-semibold text-ink-900">No new announcements</p>
              <p className="mt-1 text-[12px] leading-5 text-slate-soft">Cafe updates will appear here when staff posts them.</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function CustomerSessionView() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const isGuest = user?.role === "guest";
  const {
    pcs,
    ratePlans,
    settings,
    members,
    announcements = [],
    getMemberWallet,
    serverError,
    endSession,
    requestHelp,
    submitFeedback,
    getFeedbackHistory,
    currentClientPc,
    loading,
  } = useAppData();
  const branding = useBranding();
  const [now, setNow] = useState(Date.now());
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [assistanceSent, setAssistanceSent] = useState(false);
  const [assistanceBusy, setAssistanceBusy] = useState(false);
  const [assistanceError, setAssistanceError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [idleCountdown, setIdleCountdown] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState(null);
  const [viewFeedback, setViewFeedback] = useState(null);
  const [powerConfirm, setPowerConfirm] = useState(null);
  const warning5Key = useRef(null);
  const warning1Key = useRef(null);
  const finalPingKey = useRef(null);
  const endedSessionKey = useRef(null);
  const activeStateKey = useRef(null);
  const idleTriggered = useRef(false);

  const pc =
    (user?.pcId ? findPcById(pcs, user.pcId) : null) ??
    currentClientPc ??
    (user?.pcIp ? pcs.find((p) => p.ipAddress === user.pcIp) : null);
  const wallet = isGuest ? 0 : getMemberWallet(user.memberId);
  const memberRecord = !isGuest
    ? members.find((m) => String(m.id) === String(user.memberId))
    : null;
  const birthdayPromoActive = ratePlans.some((plan) => plan?.promoKind === "birthday" && plan?.isActive !== false && plan?.effectiveStatus === "active" && plan?.eligible === true);
  const birthdayToday = birthdayPromoActive && Boolean(memberRecord?.birthdate) && (() => {
    const d = new Date(`${String(memberRecord.birthdate).slice(0, 10)}T00:00:00`)
    const nowDate = new Date()
    return !Number.isNaN(d.getTime()) && d.getMonth() === nowDate.getMonth() && d.getDate() === nowDate.getDate()
  })();
  const birthdayAnnouncement = birthdayToday ? {
    id: `birthday-${memberRecord.id}-${new Date().getFullYear()}`,
    kind: 'Birthday',
    title: `🎂 Happy Birthday, ${memberRecord.name || user?.username || 'Customer'}!`,
    message: 'Your birthday promo is available today. Ask the counter about your birthday rate.',
    createdAt: new Date().toISOString(),
    isActive: true,
  } : null;
  const savedSessionSeconds = Number(
    memberRecord?.sessionSecondsRemaining ?? user.sessionSecondsRemaining ?? 0,
  );
  // Auth carries the just-detected guest session so the UI can switch away
  // from Member Login immediately. AppData replaces this fallback with the
  // authoritative live station session as soon as its refresh completes.
  const session = pc?.session ?? (isGuest ? user?.guestSession ?? null : null);
  const activePc = session
    ? {
        ...(pc || {}),
        id: pc?.id ?? user?.pcId ?? null,
        ipAddress: pc?.ipAddress ?? user?.pcIp ?? null,
        label: pc?.label || "Customer Station",
        session,
      }
    : pc;
  const ratePlan = rateForId(ratePlans, session?.ratePlanId);
  // Session presence is authoritative. A stale/mirrored PC status must never
  // hide an already-running session or block the wallet-start UI.
  const hasActiveSession = !!session;
  const legacyBillingSession = hasActiveSession && session?.billing !== "prepaid";
  const lowTimeThresholdSeconds = (settings.lowTimeWarningMinutes ?? 5) * 60;

  const canExtend = hasActiveSession && session.billing === "prepaid";

  useEffect(() => {
    if (!hasActiveSession) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActiveSession]);

  let remainingSeconds = null;
  let elapsedSeconds = null;
  let lowTime = false;
  let progress = null;

  if (hasActiveSession) {
    elapsedSeconds = elapsedSessionSeconds(session, now);
    if (session.billing === "prepaid") {
      remainingSeconds = remainingSessionSeconds(session, now);
      lowTime = remainingSeconds <= lowTimeThresholdSeconds && remainingSeconds > 0;
      progress = Math.max(0, Math.min(1, 1 - remainingSeconds / Math.max(1, Number(session.prepaidSeconds || 1))));
    }
  }

  useEffect(() => {
    if (!hasActiveSession || session.billing !== "prepaid") return;
    const sessionKey = `${pc?.id || "pc"}-${session?.id || session?.startedAt || "session"}`;
    if (remainingSeconds == null || remainingSeconds <= 0) return;
    const pingKey = `${sessionKey}:${remainingSeconds}`;
    if (remainingSeconds <= 5 && finalPingKey.current !== pingKey) {
      finalPingKey.current = pingKey;
      playFinalSecondPing(remainingSeconds);
      return;
    }
    if (remainingSeconds > 5) finalPingKey.current = null;
    const warningMinute = sessionWarningMinute(remainingSeconds);
    if (warningMinute === 5 && warning5Key.current !== sessionKey) {
      warning5Key.current = sessionKey;
      playSessionWarningVoice(warningMinute);
    }
    if (warningMinute === 1 && warning1Key.current !== sessionKey) {
      warning1Key.current = sessionKey;
      playSessionWarningVoice(warningMinute);
    }
  }, [remainingSeconds, lowTime, hasActiveSession, session?.billing, session?.id, session?.startedAt, pc?.id]);

  const selfServicePlans = useMemo(
    () => eligibleCustomerPlans(ratePlans, user?.tier || "Regular"),
    [ratePlans, user?.tier],
  );
  const walletStartPlans = useMemo(
    () => eligibleWalletStartPlans(ratePlans, user?.tier || "Regular"),
    [ratePlans, user?.tier],
  );
  const stationCanAttemptStart =
    !!pc && String(pc?.status || "available").toLowerCase() !== "maintenance";
  const canResumeSavedTime =
    !isGuest &&
    !hasActiveSession &&
    stationCanAttemptStart &&
    savedSessionSeconds > 0;
  const hasPurchasableWalletRate = walletStartPlans.length > 0;
  const canSelfStart =
    !isGuest &&
    !hasActiveSession &&
    stationCanAttemptStart &&
    (canResumeSavedTime || wallet > 0);
  const canStartImmediately =
    canResumeSavedTime || (wallet > 0 && hasPurchasableWalletRate);
  const cost = hasActiveSession && session.billing === "prepaid" ? (session.amount ?? 0) : 0;

  const handleHelp = useCallback(async () => {
    if (assistanceBusy || assistanceSent) return;
    setAssistanceBusy(true);
    setAssistanceError("");
    try {
      await requestHelp("Customer requested assistance from this station.");
      setAssistanceSent(true);
    } catch (error) {
      setAssistanceError(error?.message || "Unable to notify staff. Please try again.");
    } finally {
      setAssistanceBusy(false);
    }
  }, [assistanceBusy, assistanceSent, requestHelp]);

  const confirmLogout = useCallback(async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await logout();
      setLogoutOpen(false);
    } catch (error) {
      setLogoutError(error?.message || "Unable to log out. Please try again.");
    } finally {
      setLogoutBusy(false);
    }
  }, [logoutBusy, logout]);

  const handleThisPc = useCallback(() => {
    if (logoutBusy) return;
    // A legacy non-prepaid session can exist only from an older deployment.
    // Keep it staff-controlled so this prepaid-only build cannot accidentally
    // mutate or discard an unsettled historical session.
    if (legacyBillingSession) {
      void handleHelp();
      return;
    }
    confirmLogout();
  }, [logoutBusy, legacyBillingSession, handleHelp, confirmLogout]);

  useEffect(() => {
    const c = window.aezakmiClient;
    if (!c) return;
    if (hasActiveSession) {
      const stateKey = `${pc?.id || "pc"}:${session?.id || session?.startedAt || "session"}`;
      if (activeStateKey.current !== stateKey) {
        activeStateKey.current = stateKey;
        c.activateSession?.({
          sessionId: session?.id || null,
          memberId: user?.memberId || session?.customerId || null,
          role: user?.role || (session?.customerId ? "customer" : "guest"),
          billing: session?.billing || null,
          startedAt: session?.startedAt || null,
          username: user?.username || user?.name || "Guest",
          balance: wallet,
          pcLabel: pc?.label || "Customer Station",
        });
      }
      return;
    }
    activeStateKey.current = null;
    // A signed-in station without a session is a visible, maximized dashboard
    // state. Keep the shell-key guard active so virtual desktops cannot bypass
    // the station while it is waiting for a session.
    c.showIdleDashboard?.();
  }, [
    hasActiveSession,
    pc?.id,
    session?.id,
    session?.startedAt,
    user?.username,
    user?.name,
    wallet,
  ]);

  // Widget data may change every second, but this path never changes the
  // Electron window mode. Only the active-state transition above does that.
  useEffect(() => {
    if (!hasActiveSession) return;
    window.aezakmiClient?.updateWidget?.({
      username: user?.username || user?.name || "Guest",
      balance: wallet,
      remainingSeconds:
        session.billing === "prepaid"
          ? Math.max(0, remainingSeconds ?? 0)
          : null,
      pcLabel: pc?.label || "Customer Station",
    });
  }, [
    hasActiveSession,
    remainingSeconds,
    wallet,
    user?.username,
    user?.name,
    pc?.label,
    session?.billing,
  ]);

  useEffect(() => {
    if (
      !hasActiveSession ||
      session.billing !== "prepaid" ||
      remainingSeconds > 0
    )
      return;
    const key = `${pc?.id || "pc"}:${session?.id || session?.startedAt || "session"}`;
    if (endedSessionKey.current === key) return;
    endedSessionKey.current = key;
    endSession(activePc).finally(async () => {
      // Natural prepaid expiry is an authentication boundary for walk-in
      // Guests only. A signed-in member must stay authenticated so they can
      // immediately buy/resume another session or top up their wallet.
      if (isGuest) {
        window.aezakmiClient?.lockClient?.();
        await logout({ reason:"session_expired", allowDeferred:true });
      }
    });
  }, [
    hasActiveSession,
    session?.billing,
    session?.id,
    session?.startedAt,
    remainingSeconds,
    pc?.id,
    endSession,
    isGuest,
    logout,
  ]);

  useEffect(() => {
    const c = window.aezakmiClient;
    if (!c) return;
    return c.onWidgetAction?.((action) =>
      window.dispatchEvent(new CustomEvent("aezakmi:widget:" + action)),
    );
  }, []);

  useEffect(() => {
    const c = window.aezakmiClient;
    if (!c?.onTrayLogout) return;
    return c.onTrayLogout(() => handleThisPc());
  }, [handleThisPc]);

  useEffect(() => {
    const map = {
      topup: () => setTopUpOpen(true),
      extend: () => canExtend && setExtendOpen(true),
      help: handleHelp,
      logout: handleThisPc,
    };
    const ls = Object.entries(map).map(([a, fn]) => {
      const e = "aezakmi:widget:" + a;
      window.addEventListener(e, fn);
      return [e, fn];
    });
    return () => ls.forEach(([e, fn]) => window.removeEventListener(e, fn));
  }, [canExtend, handleHelp, handleThisPc]);

  const idleUiPaused = Boolean(
    topUpOpen || extendOpen || startOpen || logoutOpen || feedbackOpen || announcementsOpen || viewFeedback || powerConfirm ||
    logoutBusy || feedbackBusy || assistanceBusy
  );
  const idleUiPausedRef = useRef(idleUiPaused);
  idleUiPausedRef.current = idleUiPaused;

  useEffect(() => {
    if (!user || hasActiveSession) return undefined;
    let remaining = 300;
    idleTriggered.current = false;
    setIdleCountdown(remaining);

    const resetIdle = () => {
      if (idleTriggered.current) return;
      remaining = 300;
      setIdleCountdown(remaining);
    };
    const activityEvents = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdle, { passive: true }));

    const countdownTimer = window.setInterval(() => {
      if (idleTriggered.current || idleUiPausedRef.current) return;
      remaining = Math.max(0, remaining - 1);
      setIdleCountdown(remaining);
      if (remaining > 0) return;

      idleTriggered.current = true;
      const shutdown = window.aezakmiClient?.shutdownClient;
      void (async () => {
        try {
          await logout({ reason:"idle_shutdown", allowDeferred:true });
        } catch {}
        if (shutdown) await shutdown();
      })();
    }, 1000);

    return () => {
      window.clearInterval(countdownTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdle));
      setIdleCountdown(null);
      idleTriggered.current = false;
    };
  }, [user, hasActiveSession, logout]);

  async function openFeedback() {
    setFeedbackOpen(true);
    setFeedbackError("");
    try {
      setFeedbackHistory(await getFeedbackHistory());
    } catch (error) {
      setFeedbackError(error.message);
    }
  }

  return (
    <div className="customer-dashboard-shell">
      <header className="customer-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={branding.logoUrl || logo}
            onError={(event) => {
              event.currentTarget.src = logo;
            }}
            alt=""
            className="h-9 w-9 shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight text-ink-900">
              {branding.cafeName || settings?.cafeName || "Aezakmi Cafe"}
            </p>
            <p className="truncate text-[11px] font-medium text-slate-soft">
              {pc?.label || "Customer Station"} {pc?.ipAddress ? `· ${pc.ipAddress}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`hidden min-h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold sm:flex ${serverError ? "border-ember/30 bg-ember/10 text-ember-dim" : "border-teal/25 bg-teal/10 text-teal-dim"}`}>
            <span className={`h-2 w-2 rounded-full ${serverError ? "bg-ember" : "bg-teal"}`} />
            {serverError ? "Offline" : "Online"}
          </span>
          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
          >
            <Megaphone size={14} /> Announcements
          </button>
          <button
            type="button"
            onClick={openFeedback}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
          >
            <MessageSquareText size={14} /> Feedback
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-surface-line bg-surface text-slate-soft transition-colors hover:bg-dance/35 hover:text-ink-900"
            title={isDark ? "Use light theme" : "Use dark theme"}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            type="button"
            onClick={() => window.aezakmiClient?.hideMiniDashboard?.()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
            title="Hide this dashboard"
          >
            <Minimize2 size={14} /> Hide
          </button>
          {!legacyBillingSession && (
            <button
              type="button"
              onClick={handleThisPc}
              disabled={logoutBusy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-ember/25 bg-ember/8 px-2.5 text-[11px] font-semibold text-ember-dim transition-colors hover:bg-ember/15 disabled:opacity-50"
              title="Log out of this PC"
            >
              <LogOut size={14} /> {logoutBusy ? "Logging out…" : "Log Out"}
            </button>
          )}
        </div>
      </header>

      {serverError && (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-[12px] font-medium text-ember-dim">
          We cannot reach the cafe server right now. Some actions may not work until the connection returns.
        </div>
      )}

      <main className="customer-content-grid">
        <section className="min-h-0 min-w-0 space-y-3 overflow-hidden">
          <div className="customer-primary-card px-4 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow">{isGuest ? "Guest access" : "Signed in"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-ink-900">
                    {user.username || user.name}
                  </h1>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${isGuest ? "bg-midnight/8 text-ink-900" : (TIER_STYLE[user.tier] ?? TIER_STYLE.Regular)}`}>
                    {isGuest ? (legacyBillingSession ? "Guest · Staff checkout" : "Guest · Prepaid") : (user.tier ?? "Regular")}
                  </span>
                </div>
              </div>
              {!isGuest && (
                <div className="text-right">
                  <p className="text-[11px] font-medium text-slate-soft">Wallet Balance</p>
                  <p className="stat-figure text-[22px] font-semibold text-ink-900">{peso(wallet)}</p>
                </div>
              )}
            </div>
          </div>

          {hasActiveSession ? (
            <div className="customer-primary-card flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-surface-line px-4 py-3">
                <div>
                  <p className="eyebrow">{isGuest ? "Guest session" : "Your session"}</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink-900">
                    {legacyBillingSession
                      ? "Legacy session requires staff"
                      : (isGuest ? "Guest prepaid session" : "Prepaid session")}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${session.isLocked ? "bg-ember/10 text-ember-dim" : "bg-teal/10 text-teal-dim"}`}>
                  <span className={`h-2 w-2 rounded-full ${session.isLocked ? "bg-ember" : "bg-teal"}`} />
                  {session.isLocked ? "Paused by staff" : "Session active"}
                </span>
              </div>

              <div className="px-4 py-4 text-center">
                <p className="eyebrow mb-2">
                  {legacyBillingSession ? "Staff action required" : "Time Left"}
                </p>
                <p className={`customer-timer-value ${lowTime ? "!text-ember-dim" : ""}`}>
                  {legacyBillingSession ? "--:--" : formatClock(remainingSeconds)}
                </p>
                <p className={`mx-auto mt-2 max-w-lg text-[12px] leading-5 ${lowTime ? "font-semibold text-ember-dim" : "text-slate-soft"}`}>
                  {legacyBillingSession
                    ? "This session came from an older billing mode. Please call staff to close it safely."
                    : lowTime
                      ? `${Math.max(1, Math.ceil((remainingSeconds || 0) / 60))} min left. Add more time now if you want to keep using this PC.`
                      : "Your timer continues while this session is active."}
                </p>
                {!legacyBillingSession && (
                  <div className="mx-auto mt-3 h-2.5 w-full max-w-2xl overflow-hidden rounded-full bg-dance/65">
                    <div
                      className={`h-full rounded-full transition-[width] duration-150 ${lowTime ? "bg-ember" : "bg-teal"}`}
                      style={{ width: `${(progress ?? 0) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-surface-line px-3 py-3 sm:grid-cols-4">
                {!isGuest && (
                  <div className="customer-info-card">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Wallet Balance</p>
                    <p className="mt-1 stat-figure text-[16px] font-semibold text-ink-900">{peso(wallet)}</p>
                  </div>
                )}
                {isGuest && (
                  <div className="customer-info-card">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Guest Station</p>
                    <p className="mt-1 truncate text-[13px] font-semibold text-ink-900">{pc?.label || "This PC"}</p>
                  </div>
                )}
                <div className="customer-info-card">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Current Rate</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-ink-900">
                    {legacyBillingSession ? "Staff checkout" : (ratePlan?.name ?? "Standard rate")}
                  </p>
                </div>
                <div className="customer-info-card">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Session Type</p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-900">{legacyBillingSession ? "Legacy" : "Prepaid"}</p>
                </div>
                <div className="customer-info-card">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">
                    {legacyBillingSession ? "Status" : "Amount Paid"}
                  </p>
                  <p className="mt-1 stat-figure text-[16px] font-semibold text-ink-900">{legacyBillingSession ? "Ask staff" : peso(cost)}</p>
                </div>
              </div>

              {assistanceError && (
                <p className="mx-3 mb-2 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2 text-center text-[12px] font-medium text-ember-dim">
                  {assistanceError}
                </p>
              )}

              {isGuest ? (
                <div className={`grid ${canExtend ? "grid-cols-2" : "grid-cols-1"} gap-2 border-t border-surface-line p-3`}>
                  {canExtend && (
                    <Button
                      variant="teal"
                      icon={PlusCircle}
                      onClick={() => setExtendOpen(true)}
                      title="Add more prepaid time"
                    >
                      Add Time
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    icon={Bell}
                    onClick={handleHelp}
                    disabled={assistanceSent || assistanceBusy}
                  >
                    {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 border-t border-surface-line p-3">
                  <Button variant="primary" icon={Wallet} onClick={() => setTopUpOpen(true)}>
                    Top Up
                  </Button>
                  <Button
                    variant={canExtend ? "teal" : "ghost"}
                    icon={PlusCircle}
                    onClick={() => canExtend && setExtendOpen(true)}
                    disabled={!canExtend}
                    title={canExtend ? "Add more prepaid time" : "Add Time is available during prepaid sessions"}
                  >
                    Add Time
                  </Button>
                  <Button
                    variant="ghost"
                    icon={assistanceSent ? CheckCircle2 : Bell}
                    onClick={handleHelp}
                    disabled={assistanceSent || assistanceBusy}
                  >
                    {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : "Ask for Help"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="customer-primary-card flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-surface-line px-4 py-3.5">
                <div>
                  <p className="eyebrow">Ready when you are</p>
                  <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight text-ink-900">
                    Start using this PC
                  </h2>
                  <p className="mt-1 max-w-xl text-[12px] leading-5 text-slate-soft">
                    {isGuest
                      ? (loading ? "Loading the guest session started for this PC…" : "The guest session is reconnecting. Ask staff for help if it does not return.")
                      : canStartImmediately
                        ? "Choose Start Session to use your wallet or resume saved time."
                        : canSelfStart
                          ? "Your wallet is ready. Open Start Session and choose a preset amount or enter a custom amount."
                          : pc
                            ? "Top up your wallet or ask staff for help before starting."
                            : "This PC is still waiting to be registered with the cafe server."}
                  </p>
                </div>
                <div className="hidden rounded-2xl bg-midnight/8 p-3 text-ink-900 sm:block">
                  <PlayCircle size={28} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 px-3 py-3 sm:grid-cols-3">
                {!isGuest && (
                  <div className="customer-info-card">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Wallet Balance</p>
                    <p className="mt-1 stat-figure text-[18px] font-semibold text-ink-900">{peso(wallet)}</p>
                  </div>
                )}
                <div className="customer-info-card">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Saved Time</p>
                  <p className="mt-1 stat-figure text-[16px] font-semibold text-ink-900">
                    {savedSessionSeconds > 0 ? formatClock(savedSessionSeconds) : "None"}
                  </p>
                </div>
                <div className="customer-info-card">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Current PC</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-ink-900">{pc?.label || "Not detected"}</p>
                </div>
              </div>

              {assistanceError && (
                <p className="mx-3 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2 text-center text-[12px] font-medium text-ember-dim">
                  {assistanceError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 px-3 py-3 sm:grid-cols-3">
                {!isGuest && canSelfStart ? (
                  <Button variant="primary" icon={PlayCircle} onClick={() => setStartOpen(true)}>
                    Start Session
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={Bell}
                    onClick={handleHelp}
                    disabled={assistanceSent || assistanceBusy}
                  >
                    {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : "Ask for Help"}
                  </Button>
                )}
                {!isGuest && (
                  <Button variant="teal" icon={Wallet} onClick={() => setTopUpOpen(true)}>
                    Top Up
                  </Button>
                )}
                <Button
                  variant="ghost"
                  icon={Bell}
                  onClick={handleHelp}
                  disabled={assistanceSent || assistanceBusy}
                >
                  {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : "Ask for Help"}
                </Button>
              </div>

              {!isGuest && selfServicePlans.length > 0 && (
                <div className="min-h-0 border-t border-surface-line px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="eyebrow">Rates you can use</p>
                      <p className="mt-0.5 text-[12px] text-slate-soft">Your available prepaid choices</p>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-soft">{selfServicePlans.length} available</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selfServicePlans.slice(0, 4).map((plan) => (
                      <div key={plan.id} className="rounded-xl border border-surface-line customer-neutral-surface px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink-900">{plan.name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${TIER_STYLE[plan.customerTier || plan.customer_tier || "Regular"] || TIER_STYLE.Regular}`}>
                            {plan.customerTier || plan.customer_tier || "Regular"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-soft">{plan.description || "Available for this account."}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <AnnouncementBox
            announcements={announcements}
            onFeedback={openFeedback}
            birthdayAnnouncement={birthdayAnnouncement}
          />
          {(window.aezakmiClient?.restartClient || window.aezakmiClient?.shutdownClient) && (
            <div className="customer-support-card">
              <p className="eyebrow">PC controls</p>
              <p className="mt-1 text-[12px] leading-5 text-slate-soft">Save your work before restarting or shutting down this PC.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {window.aezakmiClient?.restartClient && (
                  <button
                    type="button"
                    onClick={() => setPowerConfirm("restart")}
                    className="customer-action-tile customer-neutral-surface text-ink-900 hover:bg-dance/35"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Monitor size={14} /> Restart</span>
                  </button>
                )}
                {window.aezakmiClient?.shutdownClient && (
                  <button
                    type="button"
                    onClick={() => setPowerConfirm("shutdown")}
                    className="customer-action-tile border-ember/25 bg-ember/8 text-ember-dim hover:bg-ember/15"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Power size={14} /> Shut Down</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>

      <Modal
        open={announcementsOpen}
        onClose={() => setAnnouncementsOpen(false)}
        eyebrow="Cafe updates"
        title="Announcements"
        description="News, promos, and reminders posted by cafe staff."
        maxWidth="max-w-xl"
        footer={
          <Button variant="primary" onClick={() => setAnnouncementsOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-2">
          {[...(birthdayAnnouncement ? [birthdayAnnouncement] : []), ...(announcements || [])]
            .filter((item) => item.isActive !== false)
            .map((announcement) => (
              <article key={announcement.id} className="rounded-xl border border-surface-line customer-neutral-surface p-3.5">
                <span className="rounded-full bg-midnight/8 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {announcement.kind || "Update"}
                </span>
                <h3 className="mt-2 text-sm font-semibold text-ink-900">{announcement.title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-slate-soft">{announcement.message}</p>
              </article>
            ))}
          {!birthdayAnnouncement && announcements.filter((item) => item.isActive !== false).length === 0 && (
            <p className="rounded-xl border border-dashed border-surface-line px-4 py-8 text-center text-[13px] text-slate-soft">
              There are no new announcements right now.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={feedbackOpen}
        onClose={() => !feedbackBusy && setFeedbackOpen(false)}
        eyebrow="Your feedback"
        title="Tell us what we can improve"
        description="Share a short message with cafe staff. Your recent submissions stay visible below."
        maxWidth="max-w-lg"
        busy={feedbackBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFeedbackOpen(false)} disabled={feedbackBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={feedbackBusy || feedback.trim().length < 3 || feedback.length > 300}
              onClick={async () => {
                setFeedbackBusy(true);
                setFeedbackError("");
                try {
                  await submitFeedback(feedback.trim());
                  setFeedback("");
                  setFeedbackOpen(false);
                } catch (error) {
                  setFeedbackError(error.message || "Unable to send feedback.");
                } finally {
                  setFeedbackBusy(false);
                }
              }}
            >
              {feedbackBusy ? "Sending…" : "Send Feedback"}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="eyebrow mb-1.5 block">Your message</span>
          <textarea
            autoFocus
            rows={4}
            maxLength={300}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What worked well, or what should we improve?"
            className="w-full resize-none rounded-xl border border-surface-line customer-neutral-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-gold/50"
          />
          <span className="mt-1.5 flex justify-between text-[11px] text-slate-soft">
            <span>
              {feedbackHistory
                ? `${feedbackHistory.used} sent · ${feedbackHistory.remaining} remaining`
                : "Up to two submissions every five days."}
            </span>
            <span>{feedback.length}/300</span>
          </span>
        </label>
        {feedbackHistory?.messages?.length > 0 && (
          <div className="mt-4 border-t border-surface-line pt-3">
            <p className="eyebrow mb-2">Recent feedback</p>
            <div className="space-y-2">
              {feedbackHistory.messages.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setViewFeedback(item)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-left text-[12px]"
                >
                  <span>{new Date(item.created_at).toLocaleDateString()} · {item.status}</span>
                  <span className="font-semibold text-ink-900">View</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {viewFeedback && (
          <div className="mt-3 rounded-xl border border-surface-line bg-surface-raised/60 p-3 text-[12px] leading-5 text-ink-900">
            <div className="mb-1 flex justify-between gap-2">
              <span className="font-semibold">Your message</span>
              <button type="button" onClick={() => setViewFeedback(null)} className="font-semibold text-slate-soft">Close</button>
            </div>
            {viewFeedback.message}
          </div>
        )}
        {feedbackError && (
          <p className="mt-3 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2 text-[12px] text-ember-dim">{feedbackError}</p>
        )}
      </Modal>

      {!isGuest && (
        <TopUpModal
          open={topUpOpen}
          onClose={() => setTopUpOpen(false)}
          pc={pc}
          customerId={user.memberId}
          customerName={user.username || user.name}
          tier={user?.tier}
          ratePlans={selfServicePlans}
        />
      )}

      {canExtend && (
        <ExtendSessionModal
          open={extendOpen}
          onClose={() => setExtendOpen(false)}
          pc={isGuest ? activePc : pc}
          memberId={user.memberId}
          wallet={wallet}
          ratePlan={ratePlan}
          tier={user?.tier}
          ratePlans={selfServicePlans}
        />
      )}

      {!isGuest && canSelfStart && (
        <StartSessionModal
          open={startOpen}
          onClose={() => setStartOpen(false)}
          pc={pc}
          memberId={user.memberId}
          wallet={wallet}
          ratePlans={walletStartPlans}
          tier={user?.tier}
          savedSeconds={savedSessionSeconds}
        />
      )}

      {idleCountdown !== null && !hasActiveSession && (
        <div
          className="fixed bottom-4 left-4 z-[600] w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-ember/35 customer-neutral-surface p-4 shadow-2xl"
          role="alertdialog"
          aria-live="assertive"
        >
          <p className="eyebrow text-ember-dim">Idle shutdown</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-[12px] leading-5 text-slate-soft">Start or resume your session before this timer ends.</p>
            <p className="stat-figure text-2xl font-semibold text-ember-dim">{idleCountdown}s</p>
          </div>
        </div>
      )}

      <Modal
        open={!!powerConfirm}
        onClose={() => setPowerConfirm(null)}
        eyebrow="PC power"
        title={`${powerConfirm === "restart" ? "Restart" : "Shut down"} this PC?`}
        description="Save your work first. The station will show a five-second warning before the power action starts."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPowerConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const command = powerConfirm;
                setPowerConfirm(null);
                const logoutPromise = logout({ reason:command, allowDeferred:true }).catch(() => null);
                try {
                  // Electron shows a five-second warning. Start lifecycle save +
                  // logout now so that warning time is also persistence time.
                  if (command === "restart") await window.aezakmiClient?.restartClient?.();
                  else await window.aezakmiClient?.shutdownClient?.();
                } finally {
                  await logoutPromise;
                }
              }}
            >
              {powerConfirm === "restart" ? "Restart PC" : "Shut Down PC"}
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-ember/20 bg-ember/8 px-3 py-3 text-[13px] leading-5 text-slate-soft">
          Any unsaved files or game progress may be lost.
        </div>
      </Modal>
    </div>
  );
}
