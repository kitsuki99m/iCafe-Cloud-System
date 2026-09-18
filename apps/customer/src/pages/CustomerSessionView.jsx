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
  LayoutDashboard,
  UtensilsCrossed,
  Ticket,
  Gamepad2,
  XCircle,
  ShoppingBag,
  ExternalLink,
  SlidersHorizontal,
  HardDrive,
  Search,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useAppData } from "../context/AppDataContext.jsx";
import { findPcById, rateForId, eligibleCustomerPlans, eligibleWalletStartPlans } from "../lib/rates.js";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import TopUpModal from "../components/customer/TopUpModal.jsx";
import ExtendSessionModal from "../components/customer/ExtendSessionModal.jsx";
import StartSessionModal from "../components/customer/StartSessionModal.jsx";
import MenuOrderModal from "../components/customer/MenuOrderModal.jsx";
import VoucherRedemptionModal from "../components/customer/VoucherRedemptionModal.jsx";
import StationLauncherConfigModal from "../components/customer/StationLauncherConfigModal.jsx";
import AdminPinGateModal from "../components/common/AdminPinGateModal.jsx";
import { playSessionWarningVoice, playFinalSecondPing } from "../lib/sound.js";
import { showToast } from "../lib/toast.js";
import logo from "../assets/aktura-logo.svg";
import { useTheme } from "../context/ThemeContext.jsx";
import { useBranding } from "../hooks/useBranding.js";
import { elapsedSessionSeconds, remainingSessionSeconds, sessionWarningMinute } from "../lib/sessionTime.js";

const DEFAULT_FALLBACK_APPS = [
  { id: "steam", name: "Steam", categoryName: "Online Games", icon: "/assets/launcher/steam.webp", protocolUrl: "steam://", executablePath: "steam.exe" },
  { id: "riot", name: "Riot / Valorant", categoryName: "Online Games", icon: "/assets/launcher/valorant.webp", protocolUrl: "riotclient://", executablePath: "RiotClientServices.exe" },
  { id: "epic", name: "Epic Games", categoryName: "Online Games", icon: "/assets/launcher/epicgames.webp", protocolUrl: "com.epicgames.launcher://", executablePath: "EpicGamesLauncher.exe" },
  { id: "roblox", name: "Roblox", categoryName: "Online Games", icon: "/assets/launcher/roblox.webp", protocolUrl: "roblox://", executablePath: "RobloxPlayerLauncher.exe" },
  { id: "dota2", name: "Dota 2", categoryName: "Online Games", icon: "/assets/launcher/dota2.webp", protocolUrl: "steam://rungameid/570", executablePath: "dota2.exe" },
  { id: "lol", name: "League of Legends", categoryName: "Online Games", icon: "/assets/launcher/lol.webp", protocolUrl: "riotclient://launch/league_of_legends", executablePath: "LeagueClient.exe" },
  { id: "cs2", name: "Counter-Strike 2", categoryName: "Online Games", icon: "/assets/launcher/cs2.webp", protocolUrl: "steam://rungameid/730", executablePath: "cs2.exe" },
  { id: "genshin", name: "Genshin Impact", categoryName: "Online Games", icon: "/assets/launcher/genshin.webp", executablePath: "GenshinImpact.exe" },
  { id: "minecraft", name: "Minecraft", categoryName: "Offline Games", icon: "/assets/launcher/minecraft.webp", executablePath: "Minecraft.exe" },
  { id: "chrome", name: "Google Chrome", categoryName: "Surfing & Browsers", icon: "/assets/launcher/chrome.webp", executablePath: "chrome.exe" },
  { id: "edge", name: "Microsoft Edge", categoryName: "Surfing & Browsers", icon: "/assets/launcher/edge.webp", executablePath: "msedge.exe" },
  { id: "brave", name: "Brave Browser", categoryName: "Surfing & Browsers", icon: "/assets/launcher/brave.webp", executablePath: "brave.exe" },
  { id: "discord", name: "Discord", categoryName: "Utilities & Chat", icon: "/assets/launcher/discord.webp", protocolUrl: "discord://", executablePath: "Discord.exe" },
  { id: "spotify", name: "Spotify", categoryName: "Utilities & Chat", icon: "/assets/launcher/spotify.webp", protocolUrl: "spotify://", executablePath: "Spotify.exe" },
  { id: "obs", name: "OBS Studio", categoryName: "Utilities & Chat", icon: "/assets/launcher/obs.webp", executablePath: "obs64.exe" },
  { id: "word", name: "Word", categoryName: "Office & Productivity", icon: "/assets/launcher/word.webp", executablePath: "WINWORD.EXE" },
  { id: "excel", name: "Excel", categoryName: "Office & Productivity", icon: "/assets/launcher/excel.webp", executablePath: "EXCEL.EXE" },
  { id: "powerpoint", name: "PowerPoint", categoryName: "Office & Productivity", icon: "/assets/launcher/powerpoint.webp", executablePath: "POWERPNT.EXE" },
  { id: "calc", name: "Calculator", categoryName: "Utilities & Chat", icon: "/assets/launcher/calculator.webp", executablePath: "calc.exe" },
  { id: "notepad", name: "Notepad", categoryName: "Utilities & Chat", icon: "/assets/launcher/notepad.webp", executablePath: "notepad.exe" },
];

function CustomerAppIcon({ icon, name, className = "h-16 w-16", iconClass = "text-2xl" }) {
  const isImage = icon && (icon.startsWith('/') || icon.startsWith('http') || icon.startsWith('data:') || /\.(webp|png|jpg|jpeg|svg)$/i.test(icon));
  const [imgError, setImgError] = useState(false);

  if (isImage && !imgError) {
    return (
      <span className={`inline-flex items-center justify-center rounded-2xl bg-surface-raised/80 border border-surface-line/50 p-2 overflow-hidden shrink-0 shadow-sm ${className}`}>
        <img
          src={icon}
          alt={name || "App Icon"}
          className="h-full w-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center rounded-2xl bg-midnight/8 ${iconClass} shrink-0 ${className}`}>
      {icon || "🎮"}
    </span>
  );
}

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
    <aside id="customer-announcements" className="customer-support-card flex min-h-0 flex-col overflow-hidden">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-midnight/8 text-ink-900">
            <Megaphone size={14} />
          </span>
          <div>
            <p className="eyebrow">Cafe updates</p>
            <h2 className="font-display text-[14px] font-semibold tracking-tight text-ink-900">Announcements</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onFeedback}
          className="inline-flex min-h-8 items-center gap-1 rounded-xl border border-surface-line customer-neutral-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
        >
          <MessageSquareText size={12} />
          Feedback
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto max-h-36 pr-1">
        {visible.length ? (
          visible.map((announcement) => (
            <article key={announcement.id} className="rounded-xl border border-surface-line customer-neutral-surface p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-midnight/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {announcement.kind || "Update"}
                </span>
                <span className="text-[10px] text-slate-soft">
                  {announcement.createdAt ? new Date(announcement.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              <h3 className="mt-1.5 font-display text-xs font-semibold text-ink-900">{announcement.title}</h3>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-soft">{announcement.message}</p>
            </article>
          ))
        ) : (
          <div className="flex min-h-[70px] items-center justify-center rounded-xl border border-dashed border-surface-line customer-neutral-surface px-4 text-center">
            <p className="text-[11px] text-slate-soft">No new announcements right now.</p>
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
    menuItems = [],
    myOrders = [],
    launcherCategories = [],
    launcherApps = [],
    stationLauncherConfig,
    reloadStationLauncherConfig,
    cancelMyOrder,
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
  const [compactView, setCompactView] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 420 && window.innerHeight <= 180);
  const [timerPreferences, setTimerPreferences] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.aezakmiClient?.getTimerPreferences?.() : null;
    const rawOpacity = Number(saved?.opacity);
    return {
      visible: saved?.visible !== false,
      opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0.2, rawOpacity)) : 0.8,
    };
  });
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [menuOrderOpen, setMenuOrderOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [appCategory, setAppCategory] = useState("All");
  const [launcherSearchQuery, setLauncherSearchQuery] = useState("");
  const [stationConfigModalOpen, setStationConfigModalOpen] = useState(false);
  const [stationPinGateOpen, setStationPinGateOpen] = useState(false);
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

  const activeCategories = useMemo(() => {
    const set = new Set(["All"]);
    launcherCategories.forEach((c) => { if (c?.name) set.add(c.name); });
    launcherApps.forEach((a) => { if (a?.categoryName || a?.category) set.add(a.categoryName || a.category); });
    stationLauncherConfig?.localApps?.forEach((a) => { if (a?.category) set.add(a.category); });
    return Array.from(set);
  }, [launcherCategories, launcherApps, stationLauncherConfig]);

  const activeAppsList = useMemo(() => {
    const base = launcherApps.length > 0 ? launcherApps.filter((a) => a.isEnabled !== false) : DEFAULT_FALLBACK_APPS;
    const local = stationLauncherConfig?.localApps || [];
    const combined = [...base, ...local];
    return combined.filter((a) => {
      const cat = a.categoryName || a.category || "Online Games";
      const matchCat = appCategory === "All" || cat === appCategory;
      const q = (launcherSearchQuery || "").toLowerCase().trim();
      const matchSearch = !q || a.name?.toLowerCase().includes(q) || cat.toLowerCase().includes(q) || a.executablePath?.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [launcherApps, stationLauncherConfig, appCategory, launcherSearchQuery]);

  const handleLaunchApp = useCallback(async (app) => {
    try {
      if (window.aezakmiClient?.launchApp) {
        await window.aezakmiClient.launchApp(app);
        showToast({ title: `Opening ${app.name}`, message: 'Application process launched.', tone: 'info' });
      } else {
        showToast({ title: 'Application Launcher', message: `Launching ${app.name} is supported in the desktop station client.`, tone: 'info' });
      }
    } catch (err) {
      showToast({ title: 'Launch Error', message: err.message || `Unable to launch ${app.name}`, tone: 'error' });
    }
  }, []);

  const handleCancelOrder = useCallback(async (orderId) => {
    if (cancellingOrderId || !cancelMyOrder) return;
    setCancellingOrderId(orderId);
    try {
      await cancelMyOrder(orderId);
      showToast({ title: 'Order Cancelled', message: 'Your order was cancelled and any wallet payment was refunded.', tone: 'success' });
    } catch (err) {
      showToast({ title: 'Cancel Failed', message: err.message || 'Unable to cancel order.', tone: 'error' });
    } finally {
      setCancellingOrderId(null);
    }
  }, [cancellingOrderId, cancelMyOrder]);

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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    // 'resize' only fires after Electron has already resized the
    // BrowserWindow, so relying on it alone means the outgoing layout stays
    // mounted — squeezed into the new bounds — for a frame before this
    // catches up. That's the flicker on Compact/Open dashboard. The main
    // process now pushes the mode explicitly the moment it decides to
    // switch, so the layout can swap immediately. 'resize' stays as a
    // fallback for the very first paint and for any host that doesn't
    // support the client bridge (e.g. a plain browser preview).
    const syncCompactView = () => setCompactView(window.innerWidth <= 420 && window.innerHeight <= 180);
    syncCompactView();
    window.addEventListener('resize', syncCompactView);
    const unsubscribe = window.aezakmiClient?.onDashboardModeChanged?.(
      (mode) => setCompactView(mode === 'compact')
    );
    return () => {
      window.removeEventListener('resize', syncCompactView);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const client = window.aezakmiClient;
    if (!client) return undefined;

    const applyPreferences = (next) => {
      const rawOpacity = Number(next?.opacity);
      setTimerPreferences({
        visible: next?.visible !== false,
        opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0.2, rawOpacity)) : 0.8,
      });
    };

    const initial = client.getTimerPreferences?.();
    if (initial) applyPreferences(initial);
    return client.onTimerPreferencesChanged?.(applyPreferences);
  }, []);


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

  const confirmGuestForfeitLogout = useCallback(async () => {
    if (logoutBusy || !isGuest || !hasActiveSession || session?.billing !== "prepaid") return;
    setLogoutBusy(true);
    setLogoutError("");
    try {
      // Guest logout with paid time remaining is deliberately destructive:
      // end the authoritative session first with `forfeit`, which zeroes any
      // recoverable remaining time, then clear the local Guest identity.
      await endSession(activePc, { disposition: "forfeit" });
      await logout({ reason: "guest_forfeit_logout" });
      setLogoutOpen(false);
    } catch (error) {
      setLogoutError(error?.message || "Unable to end the guest session. Your remaining time was not forfeited. Please try again or ask staff for help.");
    } finally {
      setLogoutBusy(false);
    }
  }, [logoutBusy, isGuest, hasActiveSession, session?.billing, endSession, activePc, logout]);

  const handleThisPc = useCallback(() => {
    if (logoutBusy) return;
    // A legacy non-prepaid session can exist only from an older deployment.
    // Keep it staff-controlled so this prepaid-only build cannot accidentally
    // mutate or discard an unsettled historical session.
    if (legacyBillingSession) {
      void handleHelp();
      return;
    }
    if (isGuest && hasActiveSession && session?.billing === "prepaid" && Number(remainingSeconds || 0) > 0) {
      setLogoutError("");
      setLogoutOpen(true);
      return;
    }
    confirmLogout();
  }, [logoutBusy, legacyBillingSession, handleHelp, isGuest, hasActiveSession, session?.billing, remainingSeconds, confirmLogout]);

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

  useEffect(() => {
    if (!user || hasActiveSession) return undefined;
    // Intentional hard boundary: a signed-in member who has not started a paid
    // session gets five minutes to begin one. User activity and open dialogs do
    // not extend or pause this countdown.
    let remaining = 300;
    idleTriggered.current = false;
    setIdleCountdown(remaining);

    const countdownTimer = window.setInterval(() => {
      if (idleTriggered.current) return;
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

  if (compactView && hasActiveSession) {
    const compactTimer = legacyBillingSession
      ? '--:--'
      : formatClock(session.billing === 'prepaid' ? Math.max(0, remainingSeconds ?? 0) : Math.max(0, elapsedSeconds ?? 0));
    return (
      <div
        data-session-widget="compact"
        className="flex h-screen w-screen select-none items-center justify-center gap-0.5 overflow-hidden rounded-[9px] border px-1 text-soft-white shadow-sm"
        style={{
          // Opacity means the dark compact TIMER BACKGROUND only. Do not fade
          // the time digits or dashboard button with BrowserWindow opacity.
          backgroundColor: `rgba(32, 41, 55, ${timerPreferences.opacity})`,
          borderColor: `rgba(255, 255, 255, ${Math.max(0.05, timerPreferences.opacity * 0.1)})`,
        }}
        title="Session timer · Right-click for settings"
      >
        <span className={`stat-figure min-w-0 flex-1 truncate text-center tabular-nums text-[11px] font-bold leading-none tracking-[-0.04em] ${lowTime ? 'text-ember-dim' : 'text-soft-white'}`}>{compactTimer}</span>
        <button
          type="button"
          onClick={() => {
            if (window.aezakmiClient?.showMiniDashboard) {
              window.aezakmiClient.showMiniDashboard();
            } else {
              setCompactView(false);
            }
          }}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white"
          title="Open dashboard"
          aria-label="Open dashboard"
        >
          <LayoutDashboard size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className={`customer-dashboard-shell h-screen w-full flex flex-col overflow-hidden bg-surface-deep text-ink-900 select-none`}>
      <header className="customer-topbar flex shrink-0 items-center justify-between border-b border-surface-line px-4 py-2.5 customer-glass z-20">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={branding.logoUrl || logo}
            onError={(event) => {
              event.currentTarget.src = logo;
            }}
            alt=""
            className="h-8 w-8 shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight text-ink-900">
              {branding.cafeName || settings?.cafeName || "Aezakmi Cafe"}
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-soft">
              <span className="font-semibold text-ink-900">{pc?.label || (isGuest ? "Guest Station" : "Customer Station")}</span>
              {pc?.ipAddress && <span>· {pc.ipAddress}</span>}
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold ${serverError ? "border border-ember/30 bg-ember/10 text-ember-dim" : "border border-teal/25 bg-teal/10 text-teal-dim"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${serverError ? "bg-ember" : "bg-teal"}`} />
                {serverError ? "Offline" : "Online"}
              </span>
            </div>
          </div>
        </div>

        {/* User Badge / Balance */}
        <div className="hidden md:flex items-center gap-2.5 customer-neutral-surface border border-surface-line px-3.5 py-1.5 rounded-xl text-xs">
          <UserRound size={14} className="text-gold-dim" />
          <span className="font-bold text-ink-900">{user.username || user.name}</span>
          <span className="text-slate-soft text-[11px] hidden lg:inline">{isGuest ? "Guest access" : "Signed in"}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isGuest ? "bg-midnight/8 text-ink-900" : (TIER_STYLE[user.tier] ?? TIER_STYLE.Regular)}`}>
            {isGuest ? (legacyBillingSession ? "Guest · Staff checkout" : "Guest · Prepaid") : (user.tier ?? "Regular")}
          </span>
          {!isGuest && (
            <span className="border-l border-surface-line pl-2.5 font-mono font-bold text-ink-900">
              {peso(wallet)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleHelp}
            disabled={assistanceSent || assistanceBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35 disabled:opacity-50"
            title="Ask staff for assistance"
          >
            <Bell size={14} /> <span className="hidden sm:inline">{assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}</span>
          </button>
          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
            title="Cafe Announcements"
          >
            <Megaphone size={14} /> <span className="hidden sm:inline">Announcements</span>
          </button>
          <button
            type="button"
            onClick={openFeedback}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
            title="Send Feedback to Staff"
          >
            <MessageSquareText size={14} /> <span className="hidden sm:inline">Feedback</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-surface-line bg-surface text-slate-soft transition-colors hover:bg-dance/35 hover:text-ink-900"
            title={isDark ? "Use light theme" : "Use dark theme"}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.aezakmiClient?.hideMiniDashboard) {
                window.aezakmiClient.hideMiniDashboard();
              } else {
                setCompactView(true);
              }
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-surface-line bg-surface px-2.5 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-dance/35"
            title="Compact to floating session timer"
          >
            <Minimize2 size={14} /> <span className="hidden sm:inline">Compact</span>
          </button>
          {!legacyBillingSession && (
            <button
              type="button"
              onClick={handleThisPc}
              disabled={logoutBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-ember/25 bg-ember/8 px-2.5 text-[11px] font-semibold text-ember-dim transition-colors hover:bg-ember/15 disabled:opacity-50"
              title="Log out of this PC"
            >
              <LogOut size={14} /> <span>{logoutBusy ? "Logging out…" : "Log Out"}</span>
            </button>
          )}
        </div>
      </header>

      {serverError && (
        <div className="mx-3.5 mt-2 shrink-0 rounded-xl border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember-dim">
          We cannot reach the cafe server right now. Some actions may not work until the connection returns.
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12 gap-3.5 p-3.5 overflow-hidden">
        {/* ======================================================== */}
        {/* LEFT COLUMN: FULL SCREEN APP & GAME LAUNCHER (MAJORITY) */}
        {/* ======================================================== */}
        <section className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 min-w-0 customer-primary-card overflow-hidden shadow-lg border border-surface-line">
          {/* Launcher Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-surface-line px-4 py-3 bg-surface-raised/40 shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim">
                <Gamepad2 size={18} />
              </span>
              <div>
                <p className="eyebrow">Station Launcher</p>
                <h2 className="font-display text-[16px] font-bold tracking-tight text-ink-900">Games & Applications</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[140px] sm:min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-soft" size={13} />
                <input
                  type="text"
                  placeholder="Search games, apps..."
                  value={launcherSearchQuery}
                  onChange={(e) => setLauncherSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-surface-line customer-neutral-surface py-1.5 pl-7 pr-2.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
                />
              </div>

              <button
                type="button"
                onClick={() => setStationPinGateOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-soft hover:text-gold-dim px-2.5 py-1.5 rounded-xl border border-surface-line customer-neutral-surface transition shrink-0"
                title="Configure Local Game Paths (Requires Master PIN)"
              >
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline">Paths</span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-surface-line/50 bg-surface-raised/20 shrink-0">
            {activeCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setAppCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  appCategory === cat
                    ? "bg-midnight/10 text-ink-900 border border-gold/40 shadow-xs"
                    : "text-slate-soft hover:text-ink-900 border border-transparent hover:bg-surface-raised/50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Launcher Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {activeAppsList.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-8 text-center text-xs text-slate-soft border border-dashed border-surface-line rounded-2xl">
                <Gamepad2 size={32} className="text-slate-soft/50 mb-2" />
                <p className="font-semibold text-ink-900 text-sm">No applications found</p>
                <p className="mt-1">No games or apps match your search filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {activeAppsList.map((app) => (
                  <button
                    key={app.id || app.name}
                    type="button"
                    onClick={() => handleLaunchApp(app)}
                    className="customer-neutral-surface border border-surface-line rounded-2xl p-3 flex flex-col items-center justify-between text-center gap-1.5 hover:bg-surface-raised/80 hover:border-gold/50 hover:shadow-md transition-all duration-200 group relative cursor-pointer active:scale-[0.98]"
                  >
                    <CustomerAppIcon
                      icon={app.icon}
                      name={app.name}
                      className="h-16 w-16 group-hover:scale-105 transition-transform duration-200 rounded-2xl shadow-sm"
                      iconClass="text-3xl"
                    />
                    <div className="min-w-0 w-full mt-1.5">
                      <span className="font-display text-xs font-bold text-ink-900 truncate block w-full">{app.name}</span>
                      <span className="text-[9px] uppercase font-semibold text-slate-soft tracking-wider truncate block w-full">
                        {app.categoryName || app.category || "Online Games"}
                      </span>
                    </div>
                    <span className="mt-1.5 w-full py-1 px-2 rounded-lg text-[11px] font-bold bg-midnight/8 text-ink-900 group-hover:bg-gold group-hover:text-midnight transition flex items-center justify-center gap-1">
                      <PlayCircle size={12} /> Launch
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: TIME, ORDERS, WALLET, SUPPORT (SIDEBAR) */}
        {/* ======================================================== */}
        <aside className="lg:col-span-4 xl:col-span-3 flex flex-col min-h-0 min-w-0 gap-3 overflow-y-auto pr-0.5">
          {/* 1. SESSION TIMER & CLOCK CARD */}
          {hasActiveSession ? (
            <div className="customer-primary-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-surface-line px-3.5 py-2.5 bg-surface-raised/30">
                <div>
                  <p className="eyebrow">{isGuest ? (legacyBillingSession ? "Guest checkout" : "Guest prepaid session") : "Your Session"}</p>
                  <p className="text-xs font-semibold text-ink-900">
                    {legacyBillingSession ? "Staff checkout" : (ratePlan?.name || "Prepaid Rate")}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${session.isLocked ? "bg-ember/10 text-ember-dim" : "bg-teal/10 text-teal-dim"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${session.isLocked ? "bg-ember" : "bg-teal"}`} />
                  {session.isLocked ? "Paused" : "Active"}
                </span>
              </div>

              <div className="px-4 py-3.5 text-center">
                <p className="eyebrow mb-1">
                  {legacyBillingSession ? "Staff action required" : "Time Left"}
                </p>
                <p className={`font-mono text-3xl sm:text-4xl font-black tracking-tight ${lowTime ? "text-ember-dim animate-pulse" : "text-ink-900"}`}>
                  {legacyBillingSession ? "--:--" : formatClock(remainingSeconds)}
                </p>
                <p className={`mt-1 text-[11px] ${lowTime || legacyBillingSession ? "font-semibold text-ember-dim" : "text-slate-soft"}`}>
                  {legacyBillingSession
                    ? "This session came from an older billing mode. Please call staff to close it safely."
                    : lowTime
                      ? `${Math.max(1, Math.ceil((remainingSeconds || 0) / 60))}m left. Add time to continue.`
                      : "Active timer"}
                </p>
                {!legacyBillingSession && (
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-dance/65">
                    <div
                      className={`h-full rounded-full transition-[width] duration-150 ${lowTime ? "bg-ember" : "bg-teal"}`}
                      style={{ width: `${(progress ?? 0) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 border-t border-surface-line p-2 text-center text-xs">
                <div className="customer-neutral-surface rounded-xl p-2">
                  <p className="text-[10px] text-slate-soft font-medium uppercase">Elapsed</p>
                  <p className="font-mono font-bold text-ink-900 text-xs mt-0.5">{formatClock(elapsedSeconds)}</p>
                </div>
                <div className="customer-neutral-surface rounded-xl p-2">
                  <p className="text-[10px] text-slate-soft font-medium uppercase">Amount Paid</p>
                  <p className="font-mono font-bold text-ink-900 text-xs mt-0.5">{peso(cost)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="customer-primary-card flex flex-col overflow-hidden p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="eyebrow">Station Ready</p>
                  <h3 className="font-display text-sm font-bold text-ink-900">Start using this PC</h3>
                  <p className="mt-0.5 text-[11px] text-slate-soft">
                    {isGuest
                      ? (loading ? "Reconnecting guest session…" : "Guest session reconnecting.")
                      : canStartImmediately
                        ? "Start or resume."
                        : canSelfStart
                          ? "Start with wallet."
                          : pc
                            ? "Top up to start."
                            : "Waiting for PC registration."}
                  </p>
                </div>
                <PlayCircle size={24} className="text-gold-dim shrink-0" />
              </div>
              {!isGuest && canSelfStart ? (
                <Button variant="primary" icon={PlayCircle} onClick={() => setStartOpen(true)} className="w-full">
                  Start Session
                </Button>
              ) : (
                <Button variant="primary" icon={Bell} onClick={handleHelp} disabled={assistanceSent || assistanceBusy} className="w-full">
                  {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}
                </Button>
              )}
            </div>
          )}

          {/* 2. QUICK ACTIONS & WALLET CARD */}
          <div className="customer-primary-card p-3 space-y-2">
            {!isGuest && (
              <div className="flex items-center justify-between px-1 pb-1">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-soft">Wallet Balance</p>
                  <p className="font-mono font-bold text-lg text-ink-900">{peso(wallet)}</p>
                </div>
                {savedSessionSeconds > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-semibold text-slate-soft">Saved Time</p>
                    <p className="font-mono font-bold text-sm text-teal-dim">{formatClock(savedSessionSeconds)}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {canExtend ? (
                <Button variant="teal" icon={PlusCircle} onClick={() => setExtendOpen(true)} size="sm">
                  Add Time
                </Button>
              ) : (
                <Button variant="ghost" icon={Bell} onClick={handleHelp} disabled={assistanceSent || assistanceBusy} size="sm">
                  {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}
                </Button>
              )}
              {!isGuest ? (
                <Button variant="primary" icon={Wallet} onClick={() => setTopUpOpen(true)} size="sm">
                  Top Up
                </Button>
              ) : (
                <Button variant="ghost" icon={Ticket} onClick={() => setVoucherOpen(true)} size="sm">
                  Voucher
                </Button>
              )}
            </div>
            {!isGuest && (
              <Button variant="ghost" icon={Ticket} onClick={() => setVoucherOpen(true)} size="sm" className="w-full">
                Redeem Voucher
              </Button>
            )}
          </div>

          {/* 3. CAFE KITCHEN / FOOD & DRINKS ORDERING */}
          <div className="customer-primary-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-surface-line px-3.5 py-2.5 bg-surface-raised/30">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <UtensilsCrossed size={14} />
                </span>
                <div>
                  <p className="eyebrow">Cafe Kitchen</p>
                  <h3 className="font-display text-xs font-bold text-ink-900">Food & Drinks</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOrderOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-500 hover:bg-amber-500/20 transition"
              >
                <ShoppingBag size={12} /> Order Food
              </button>
            </div>

            {/* Active Orders List */}
            {myOrders.length > 0 ? (
              <div className="divide-y divide-surface-line overflow-y-auto max-h-48 p-1">
                {myOrders.slice(0, 4).map((order) => {
                  const status = order.order_status || order.orderStatus || 'pending';
                  const isPending = status === 'pending';
                  const isPreparing = status === 'preparing';
                  const isFulfilled = status === 'fulfilled';
                  let parsedItems = [];
                  try {
                    parsedItems = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items || []);
                  } catch {
                    parsedItems = [];
                  }
                  return (
                    <div key={order.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded-md text-[9px] font-bold uppercase ${
                              isPending
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                : isPreparing
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : isFulfilled
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {status}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-ink-900">₱{Number(order.total || 0).toFixed(2)}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-soft truncate">
                          {parsedItems.map((i) => `${i.quantity}x ${i.name}`).join(', ') || 'Order items'}
                        </p>
                      </div>
                      {isPending && (
                        <button
                          type="button"
                          disabled={cancellingOrderId === order.id}
                          onClick={() => handleCancelOrder(order.id)}
                          className="shrink-0 px-2 py-1 rounded-lg border border-ember/30 bg-ember/10 text-ember-dim font-bold text-[10px] hover:bg-ember/20 transition disabled:opacity-50"
                        >
                          {cancellingOrderId === order.id ? '…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-soft">
                <p className="text-[11px]">Noodles, snacks, and chilled drinks delivered straight to your station.</p>
                <button
                  type="button"
                  onClick={() => setMenuOrderOpen(true)}
                  className="mt-2 text-gold-dim hover:underline font-bold text-xs"
                >
                  Browse Menu & Order →
                </button>
              </div>
            )}
          </div>

          {/* 4. ANNOUNCEMENTS & SUPPORT */}
          <AnnouncementBox
            announcements={announcements}
            onFeedback={openFeedback}
            birthdayAnnouncement={birthdayAnnouncement}
          />

          {/* 5. PC CONTROLS */}
          {(window.aezakmiClient?.restartClient || window.aezakmiClient?.shutdownClient) && (
            <div className="customer-support-card">
              <p className="eyebrow">PC controls</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {window.aezakmiClient?.restartClient && (
                  <button
                    type="button"
                    onClick={() => setPowerConfirm("restart")}
                    className="customer-action-tile customer-neutral-surface text-ink-900 hover:bg-dance/35 py-2 text-xs"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Monitor size={13} /> Restart</span>
                  </button>
                )}
                {window.aezakmiClient?.shutdownClient && (
                  <button
                    type="button"
                    onClick={() => setPowerConfirm("shutdown")}
                    className="customer-action-tile border-ember/25 bg-ember/8 text-ember-dim hover:bg-ember/15 py-2 text-xs"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Power size={13} /> Shut Down</span>
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
        open={logoutOpen}
        onClose={() => { if (!logoutBusy) { setLogoutOpen(false); setLogoutError(""); } }}
        eyebrow="Guest session"
        title="Forfeit remaining session time?"
        description="Logging out now will stop this Guest session immediately and permanently discard any unused prepaid time."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setLogoutOpen(false); setLogoutError(""); }} disabled={logoutBusy}>
              Keep Session
            </Button>
            <Button variant="danger" onClick={confirmGuestForfeitLogout} disabled={logoutBusy}>
              {logoutBusy ? "Ending session…" : "Forfeit & Log Out"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-ember/25 bg-ember/8 px-3 py-3 text-[13px] leading-5 text-ink-900">
            <p className="font-semibold text-ember-dim">This cannot be undone.</p>
            <p className="mt-1 text-slate-soft">
              You currently have <span className="font-semibold text-ink-900">{formatClock(Math.max(0, remainingSeconds || 0))}</span> remaining.
              Confirming will set that remaining time to zero, end the session, and return this PC to the login kiosk.
            </p>
          </div>
          {logoutError && (
            <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-[12px] leading-5 text-ember-dim">{logoutError}</p>
          )}
        </div>
      </Modal>

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

      <MenuOrderModal
        isOpen={menuOrderOpen}
        onClose={() => setMenuOrderOpen(false)}
      />

      <VoucherRedemptionModal
        isOpen={voucherOpen}
        onClose={() => setVoucherOpen(false)}
      />

      <AdminPinGateModal
        open={stationPinGateOpen}
        onClose={() => setStationPinGateOpen(false)}
        onVerified={() => {
          setStationPinGateOpen(false);
          setStationConfigModalOpen(true);
        }}
      />

      <StationLauncherConfigModal
        open={stationConfigModalOpen}
        onClose={() => setStationConfigModalOpen(false)}
        serverApps={launcherApps}
        serverCategories={launcherCategories}
        onConfigChanged={() => reloadStationLauncherConfig?.()}
      />
    </div>
  );
}
