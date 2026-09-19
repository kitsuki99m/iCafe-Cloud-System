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
  Banknote,
  ReceiptText,
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
import PhtClock from "../components/common/PhtClock.jsx";
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

function CustomerAppIcon({ icon, name, className = "h-12 w-12", iconClass = "text-xl" }) {
  const isImage = icon && (icon.startsWith('/') || icon.startsWith('http') || icon.startsWith('data:') || /\.(webp|png|jpg|jpeg|svg)$/i.test(icon));
  const [imgError, setImgError] = useState(false);

  if (isImage && !imgError) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-surface-raised/80 border border-surface-line/50 p-1.5 overflow-hidden shrink-0 shadow-xs ${className}`}>
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
    <span className={`inline-flex items-center justify-center rounded-xl bg-midnight/8 ${iconClass} shrink-0 ${className}`}>
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


export default function CustomerSessionView() {
  const { user, logout, isDevBypass } = useAuth();
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
    placeMenuOrder,
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
  const [sidebarCart, setSidebarCart] = useState({});
  const [sidebarOrdering, setSidebarOrdering] = useState(false);
  const warning5Key = useRef(null);
  const warning1Key = useRef(null);
  const finalPingKey = useRef(null);
  const endedSessionKey = useRef(null);
  const activeStateKey = useRef(null);
  const idleTriggered = useRef(false);
  const announcementsDropdownRef = useRef(null);
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const systemMenuRef = useRef(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const ordersDropdownRef = useRef(null);

  useEffect(() => {
    if (!ordersOpen) return;
    function handleClickOutside(event) {
      if (ordersDropdownRef.current && !ordersDropdownRef.current.contains(event.target)) {
        setOrdersOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOrdersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ordersOpen]);

  useEffect(() => {
    if (!announcementsOpen) return;
    function handleClickOutside(event) {
      if (announcementsDropdownRef.current && !announcementsDropdownRef.current.contains(event.target)) {
        setAnnouncementsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAnnouncementsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [announcementsOpen]);

  useEffect(() => {
    if (!systemMenuOpen) return;
    function handleClickOutside(event) {
      if (systemMenuRef.current && !systemMenuRef.current.contains(event.target)) {
        setSystemMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSystemMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [systemMenuOpen]);

  const sidebarCartItems = useMemo(() => {
    return Object.entries(sidebarCart).map(([id, qty]) => {
      const item = menuItems.find(m => String(m.id) === String(id));
      return { item, quantity: qty };
    }).filter(i => i.item && i.quantity > 0);
  }, [sidebarCart, menuItems]);

  const sidebarCartTotal = useMemo(() => {
    return sidebarCartItems.reduce((sum, { item, quantity }) => sum + (Number(item.price || 0) * quantity), 0);
  }, [sidebarCartItems]);

  const [quickCategory, setQuickCategory] = useState("All");

  function addToSidebarCart(item) {
    const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity;
    if (stock !== null && stock !== undefined && Number(stock) <= 0) {
      showToast({ title: 'Out of Stock', message: `"${item.name}" is currently out of stock.`, tone: 'warning' });
      return;
    }
    setSidebarCart(curr => {
      const currentQty = curr[item.id] || 0;
      if (stock !== null && stock !== undefined && currentQty >= Number(stock)) {
        showToast({ title: 'Stock Limit Reached', message: `Only ${stock} available in stock.`, tone: 'warning' });
        return curr;
      }
      return {
        ...curr,
        [item.id]: currentQty + 1,
      };
    });
  }

  function removeFromSidebarCart(itemId) {
    setSidebarCart(curr => {
      const next = { ...curr };
      if ((next[itemId] || 0) <= 1) {
        delete next[itemId];
      } else {
        next[itemId] -= 1;
      }
      return next;
    });
  }

  const pendingOrdersCount = useMemo(() => {
    return (myOrders || []).filter((o) => {
      const status = o.order_status || o.orderStatus || o.status || 'pending';
      return status === 'pending' || status === 'preparing';
    }).length;
  }, [myOrders]);

  const lastCancelTimeRef = useRef(0);

  async function handleSidebarOrder(paymentMethod = 'wallet') {
    if (sidebarCartItems.length === 0 || sidebarOrdering || !placeMenuOrder) return;
    if (pendingOrdersCount >= 3) {
      showToast({
        title: 'Order Limit Reached',
        message: 'You already have 3 pending orders in the kitchen queue. Please wait before placing more orders.',
        tone: 'warning',
      });
      return;
    }
    if (paymentMethod === 'wallet' && Number(wallet || 0) < sidebarCartTotal) {
      showToast({ title: 'Insufficient Wallet', message: 'Not enough balance. Please choose cash or top up.', tone: 'error' });
      return;
    }
    setSidebarOrdering(true);
    try {
      const payload = {
        items: sidebarCartItems.map(({ item, quantity }) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity,
        })),
        total: sidebarCartTotal,
        paymentMethod,
      };
      await placeMenuOrder(payload);
      showToast({
        title: 'Order Placed!',
        message: paymentMethod === 'wallet'
          ? `₱${sidebarCartTotal.toFixed(2)} debited. Kitchen is preparing your order!`
          : `Order sent! Please prepare ₱${sidebarCartTotal.toFixed(2)} cash.`,
        tone: 'success',
      });
      setSidebarCart({});
    } catch (err) {
      showToast({ title: 'Order Failed', message: err?.message || 'Unable to place order.', tone: 'error' });
    } finally {
      setSidebarOrdering(false);
    }
  }

  async function handleCancelOrder(orderId) {
    if (!orderId || cancellingOrderId || !cancelMyOrder) return;
    const now = Date.now();
    if (now - lastCancelTimeRef.current < 4000) {
      showToast({ title: 'Please Wait', message: 'Please wait a few seconds before cancelling another order.', tone: 'warning' });
      return;
    }
    lastCancelTimeRef.current = now;
    setCancellingOrderId(orderId);
    try {
      await cancelMyOrder(orderId);
      showToast({ title: 'Order Cancelled', message: 'Your order was cancelled.', tone: 'info' });
    } catch (err) {
      showToast({ title: 'Cancel Failed', message: err?.message || 'Unable to cancel order.', tone: 'error' });
    } finally {
      setCancellingOrderId(null);
    }
  }

  const popularMenuItems = useMemo(() => {
    return menuItems.filter(m => m.isAvailable !== false).slice(0, 6);
  }, [menuItems]);

  const quickSnackCategories = useMemo(() => {
    const cats = new Set(["All"]);
    menuItems.forEach((item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable);
      if (isAvail && item.category) {
        const c = item.category.trim();
        if (c) cats.add(c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());
      }
    });
    return Array.from(cats);
  }, [menuItems]);

  const quickSnackItems = useMemo(() => {
    return menuItems.filter((item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable);
      if (!isAvail) return false;
      if (quickCategory === "All") return true;
      return (item.category || "").toLowerCase() === quickCategory.toLowerCase();
    });
  }, [menuItems, quickCategory]);

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

  const activeAnnouncementsList = useMemo(() => {
    return [
      ...(birthdayAnnouncement ? [birthdayAnnouncement] : []),
      ...(announcements || []),
    ].filter((item) => item.isActive !== false);
  }, [birthdayAnnouncement, announcements]);
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
    if (isDevBypass || !user || hasActiveSession) return undefined;
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
    <div className={`customer-dashboard-shell h-screen w-full flex flex-col overflow-hidden bg-surface-deep text-ink-900 select-none p-3.5 gap-3.5`}>
      <header className="customer-topbar flex shrink-0 items-center justify-between border border-surface-line px-4 py-2 rounded-2xl customer-glass shadow-sm z-20">
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
          {isDevBypass && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Dev Platform Bypass
            </div>
          )}
        </div>

        {/* Live Philippine Time Clock */}
        <PhtClock className="hidden md:inline-flex" />

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
          {/* Announcements Dropdown Menu */}
          <div className="relative" ref={announcementsDropdownRef}>
            <button
              type="button"
              onClick={() => setAnnouncementsOpen((prev) => !prev)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors ${
                announcementsOpen
                  ? "border-gold bg-gold/20 text-ink-900 shadow-sm"
                  : activeAnnouncementsList.length > 0
                    ? "border-gold/40 bg-gold/10 text-gold-dim hover:bg-gold/20"
                    : "border-surface-line bg-surface text-ink-900 hover:bg-dance/35"
              }`}
              title="Cafe Announcements & Promos"
              aria-expanded={announcementsOpen}
            >
              <Megaphone size={14} className={activeAnnouncementsList.length > 0 || announcementsOpen ? "text-gold" : "text-slate-soft"} />
              <span className="hidden sm:inline">Announcements</span>
              {activeAnnouncementsList.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-black text-midnight shadow-xs">
                  {activeAnnouncementsList.length}
                </span>
              )}
            </button>

            {/* Compact Dropdown Popover */}
            {announcementsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-surface-line bg-surface shadow-2xl z-50 overflow-hidden flex flex-col">
                {/* Dropdown Header */}
                <div className="flex items-center justify-between border-b border-surface-line px-3.5 py-2.5 bg-surface-raised/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-midnight/8 text-gold-dim">
                      <Megaphone size={12} />
                    </span>
                    <div>
                      <p className="eyebrow">Updates</p>
                      <h3 className="font-display text-xs font-bold text-ink-900">Announcements</h3>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-soft px-2 py-0.5 rounded-full bg-surface-raised">
                    {activeAnnouncementsList.length} {activeAnnouncementsList.length === 1 ? "update" : "updates"}
                  </span>
                </div>

                {/* Compact Announcements List */}
                <div className="max-h-72 overflow-y-auto divide-y divide-surface-line/40 p-2 space-y-1.5">
                  {activeAnnouncementsList.map((announcement) => (
                    <article key={announcement.id} className="rounded-xl border border-surface-line/60 customer-neutral-surface p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-midnight/8 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-gold-dim border border-gold/20">
                          {announcement.kind || "Update"}
                        </span>
                        <span className="text-[9px] text-slate-soft">
                          {announcement.createdAt ? new Date(announcement.createdAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-ink-900 leading-tight">{announcement.title}</h4>
                      <p className="text-[11px] leading-4 text-slate-soft">{announcement.message}</p>
                    </article>
                  ))}
                  {activeAnnouncementsList.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-soft">
                      <p>No new announcements right now.</p>
                    </div>
                  )}
                </div>

                {/* Dropdown Footer */}
                <div className="border-t border-surface-line p-2 bg-surface-raised/20 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnnouncementsOpen(false);
                      openFeedback();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-soft hover:text-ink-900 px-2 py-1 rounded-lg hover:bg-surface-raised transition cursor-pointer"
                  >
                    <MessageSquareText size={12} /> Feedback
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnouncementsOpen(false)}
                    className="text-[11px] font-bold text-ink-900 hover:text-gold-dim px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-dance/35 transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
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

          {/* Unified Options & Power Menu */}
          <div className="relative" ref={systemMenuRef}>
            <button
              type="button"
              onClick={() => setSystemMenuOpen((prev) => !prev)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                systemMenuOpen
                  ? "border-ember/40 bg-ember/15 text-ember-dim"
                  : "border-surface-line bg-surface text-ink-900 hover:bg-dance/35"
              }`}
              title="Station Options & Power Controls"
              aria-expanded={systemMenuOpen}
            >
              <Power size={14} className={systemMenuOpen ? "text-ember" : "text-slate-soft"} />
              <span className="hidden sm:inline">Options</span>
            </button>

            {/* Dropdown Popover */}
            {systemMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-surface-line bg-surface shadow-2xl z-50 overflow-hidden p-1.5 space-y-1">
                {/* Station Info Header */}
                <div className="px-2.5 py-1.5 border-b border-surface-line/50 mb-1">
                  <p className="eyebrow">Station Options</p>
                  <p className="font-bold text-ink-900 text-xs truncate">{user?.username || user?.name || "Customer"}</p>
                  <p className="text-[10px] text-slate-soft">{pc?.label || "Station PC"}</p>
                </div>

                {/* Feedback */}
                <button
                  type="button"
                  onClick={() => {
                    setSystemMenuOpen(false);
                    openFeedback();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-900 hover:bg-surface-raised transition cursor-pointer text-left"
                >
                  <MessageSquareText size={14} className="text-slate-soft" />
                  <span>Feedback</span>
                </button>

                {/* Dark/Light Mode */}
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-900 hover:bg-surface-raised transition cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2.5">
                    {isDark ? <Moon size={14} className="text-slate-soft" /> : <Sun size={14} className="text-slate-soft" />}
                    <span>{isDark ? "Dark Theme" : "Light Theme"}</span>
                  </span>
                  <span className="text-[10px] text-slate-soft font-mono uppercase bg-midnight/8 px-1.5 py-0.5 rounded-md">
                    {isDark ? "Dark" : "Light"}
                  </span>
                </button>

                {/* Power Options */}
                <div className="border-t border-surface-line/50 my-1 pt-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSystemMenuOpen(false);
                      setPowerConfirm("restart");
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-900 hover:bg-dance/35 transition cursor-pointer text-left"
                  >
                    <Monitor size={14} className="text-slate-soft" />
                    <span>Restart Station</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSystemMenuOpen(false);
                      setPowerConfirm("shutdown");
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ember-dim hover:bg-ember/15 transition cursor-pointer text-left"
                  >
                    <Power size={14} className="text-ember" />
                    <span>Shut Down Station</span>
                  </button>
                </div>

                {/* Logout */}
                {!legacyBillingSession && (
                  <div className="border-t border-surface-line/50 my-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSystemMenuOpen(false);
                        handleThisPc();
                      }}
                      disabled={logoutBusy}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ember-dim hover:bg-ember/15 transition cursor-pointer text-left disabled:opacity-50"
                    >
                      <LogOut size={14} />
                      <span>{logoutBusy ? "Logging out…" : "Log Out"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {serverError && (
        <div className="mx-3.5 mt-2 shrink-0 rounded-xl border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember-dim">
          We cannot reach the cafe server right now. Some actions may not work until the connection returns.
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12 gap-3.5 overflow-hidden">
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
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2 sm:gap-2.5">
                {activeAppsList.map((app) => (
                  <button
                    key={app.id || app.name}
                    type="button"
                    onClick={() => handleLaunchApp(app)}
                    className="customer-neutral-surface border border-surface-line rounded-xl p-2 sm:p-2.5 flex flex-col items-center justify-between text-center gap-1 hover:bg-surface-raised/80 hover:border-gold/50 hover:shadow-md transition-all duration-200 group relative cursor-pointer active:scale-[0.98]"
                  >
                    <CustomerAppIcon
                      icon={app.icon}
                      name={app.name}
                      className="h-11 w-11 sm:h-12 sm:w-12 group-hover:scale-105 transition-transform duration-200 rounded-xl shadow-xs"
                      iconClass="text-xl"
                    />
                    <div className="min-w-0 w-full mt-0.5">
                      <span className="font-display text-[11px] font-bold text-ink-900 truncate block w-full leading-tight">{app.name}</span>
                      <span className="text-[8.5px] uppercase font-semibold text-slate-soft tracking-wider truncate block w-full mt-0.5">
                        {app.categoryName || app.category || "Online Games"}
                      </span>
                    </div>
                    <span className="mt-1 w-full py-0.5 px-1.5 rounded-md text-[10px] font-bold bg-midnight/8 text-ink-900 group-hover:bg-gold group-hover:text-midnight transition flex items-center justify-center gap-1">
                      <PlayCircle size={10} /> Launch
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
          {/* 1. UNIFIED SESSION & WALLET CARD */}
          <div className="customer-primary-card shrink-0 flex flex-col overflow-hidden shadow-sm">
            {/* Card Header: Session Info & Status */}
            <div className="flex items-center justify-between gap-2 border-b border-surface-line px-3.5 py-2.5 bg-surface-raised/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-midnight/8 text-teal-dim shrink-0">
                  <Clock size={14} />
                </span>
                <div className="min-w-0">
                  <p className="eyebrow truncate">{isGuest ? (legacyBillingSession ? "Guest checkout" : "Guest prepaid session") : "Your Session"}</p>
                  <p className="text-xs font-semibold text-ink-900 truncate">
                    {hasActiveSession
                      ? (legacyBillingSession ? "Staff checkout" : (ratePlan?.name || "Prepaid Rate"))
                      : "Station Ready"}
                  </p>
                </div>
              </div>
              {hasActiveSession ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${session.isLocked ? "bg-ember/10 text-ember-dim" : "bg-teal/10 text-teal-dim"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${session.isLocked ? "bg-ember" : "bg-teal"}`} />
                  {session.isLocked ? "Paused" : "Active"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-500/10 text-slate-soft shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Idle
                </span>
              )}
            </div>

            {/* Card Main: Digital Timer or Station Ready */}
            <div className="px-4 py-3 text-center">
              {hasActiveSession ? (
                <>
                  <p className="eyebrow mb-0.5">
                    {legacyBillingSession ? "Staff action required" : "Time Left"}
                  </p>
                  <p className={`font-mono text-3xl sm:text-4xl font-black tracking-tight ${lowTime ? "text-ember-dim animate-pulse" : "text-ink-900"}`}>
                    {legacyBillingSession ? "--:--" : formatClock(remainingSeconds)}
                  </p>
                  {(lowTime || legacyBillingSession) && (
                    <p className="mt-1 text-[11px] font-semibold text-ember-dim">
                      {legacyBillingSession
                        ? "This session came from an older billing mode. Please call staff to close it safely."
                        : `${Math.max(1, Math.ceil((remainingSeconds || 0) / 60))}m left. Add time to continue.`}
                    </p>
                  )}
                  {!legacyBillingSession && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-dance/65">
                      <div
                        className={`h-full rounded-full transition-[width] duration-150 ${lowTime ? "bg-ember" : "bg-teal"}`}
                        style={{ width: `${(progress ?? 0) * 100}%` }}
                      />
                    </div>
                  )}

                  {/* Quick Add Time Chips */}
                  {canExtend && (
                    <div className="mt-2 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExtendOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal/30 bg-teal/10 px-2.5 py-0.5 text-[11px] font-bold text-teal-dim hover:bg-teal/20 transition cursor-pointer"
                        title="Add 1 Hour"
                      >
                        <PlusCircle size={11} /> +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtendOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal/30 bg-teal/10 px-2.5 py-0.5 text-[11px] font-bold text-teal-dim hover:bg-teal/20 transition cursor-pointer"
                        title="Add 3 Hours"
                      >
                        <PlusCircle size={11} /> +3 Hours
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-2">
                  <p className="eyebrow mb-1">Start Station</p>
                  <h3 className="font-display text-base font-bold text-ink-900">PC Available</h3>
                  <p className="mt-1 text-xs text-slate-soft">
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
              )}
            </div>

            {/* Metrics Grid: Wallet Balance + Elapsed / Amount */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 border-t border-surface-line p-2 text-center text-xs bg-surface-raised/10">
              {!isGuest && (
                <div className="customer-neutral-surface rounded-xl p-2 flex flex-col justify-center">
                  <p className="text-[10px] text-slate-soft font-semibold uppercase tracking-wider">Wallet</p>
                  <p className="font-mono font-black text-ink-900 text-sm mt-0.5 text-gold-dim">{peso(wallet)}</p>
                </div>
              )}
              {hasActiveSession ? (
                <>
                  <div className="customer-neutral-surface rounded-xl p-2 flex flex-col justify-center">
                    <p className="text-[10px] text-slate-soft font-medium uppercase tracking-wider">Elapsed</p>
                    <p className="font-mono font-bold text-ink-900 text-xs mt-0.5">{formatClock(elapsedSeconds)}</p>
                  </div>
                  <div className={`customer-neutral-surface rounded-xl p-2 flex flex-col justify-center ${isGuest ? "col-span-1" : ""}`}>
                    <p className="text-[10px] text-slate-soft font-medium uppercase tracking-wider">Cost</p>
                    <p className="font-mono font-bold text-ink-900 text-xs mt-0.5">{peso(cost)}</p>
                  </div>
                </>
              ) : (
                <>
                  {savedSessionSeconds > 0 && (
                    <div className="customer-neutral-surface rounded-xl p-2 flex flex-col justify-center">
                      <p className="text-[10px] text-slate-soft font-medium uppercase tracking-wider">Saved Time</p>
                      <p className="font-mono font-bold text-teal-dim text-xs mt-0.5">{formatClock(savedSessionSeconds)}</p>
                    </div>
                  )}
                  <div className={`customer-neutral-surface rounded-xl p-2 flex flex-col justify-center ${isGuest ? "col-span-2" : savedSessionSeconds > 0 ? "" : "col-span-1"}`}>
                    <p className="text-[10px] text-slate-soft font-medium uppercase tracking-wider">Rate Tier</p>
                    <p className="font-semibold text-ink-900 text-xs mt-0.5">{user?.tier || "Regular"}</p>
                  </div>
                </>
              )}
            </div>

            {/* Unified Action Controls */}
            <div className="border-t border-surface-line p-2 bg-surface-raised/20">
              {hasActiveSession ? (
                <div className={`grid gap-1.5 ${isGuest ? "grid-cols-2" : "grid-cols-3"}`}>
                  {canExtend ? (
                    <Button
                      variant="teal"
                      icon={PlusCircle}
                      onClick={() => setExtendOpen(true)}
                      size="sm"
                      className="w-full text-xs px-1"
                    >
                      Add Time
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={Bell}
                      onClick={handleHelp}
                      disabled={assistanceSent || assistanceBusy}
                      size="sm"
                      className="w-full text-xs px-1"
                    >
                      {assistanceBusy ? "Calling…" : assistanceSent ? "Notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}
                    </Button>
                  )}
                  {!isGuest ? (
                    <Button
                      variant="primary"
                      icon={Wallet}
                      onClick={() => setTopUpOpen(true)}
                      size="sm"
                      className="w-full text-xs px-1"
                    >
                      Top Up
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={Ticket}
                      onClick={() => setVoucherOpen(true)}
                      size="sm"
                      className="w-full text-xs px-1"
                    >
                      Voucher
                    </Button>
                  )}
                  {!isGuest && (
                    <Button
                      variant="ghost"
                      icon={Ticket}
                      onClick={() => setVoucherOpen(true)}
                      size="sm"
                      className="w-full text-xs px-1 border border-surface-line/70"
                    >
                      Voucher
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {!isGuest && canSelfStart ? (
                    <Button
                      variant="primary"
                      icon={PlayCircle}
                      onClick={() => setStartOpen(true)}
                      className="w-full"
                    >
                      Start Session
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      icon={Bell}
                      onClick={handleHelp}
                      disabled={assistanceSent || assistanceBusy}
                      className="w-full"
                    >
                      {assistanceBusy ? "Calling staff…" : assistanceSent ? "Staff notified" : legacyBillingSession ? "Call Staff" : "Ask for Help"}
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {!isGuest && (
                      <Button
                        variant="outline"
                        icon={Wallet}
                        onClick={() => setTopUpOpen(true)}
                        size="sm"
                        className="w-full"
                      >
                        Top Up
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      icon={Ticket}
                      onClick={() => setVoucherOpen(true)}
                      size="sm"
                      className={`w-full ${isGuest ? "col-span-2" : ""}`}
                    >
                      Redeem Voucher
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. CAFE KITCHEN / FOOD & DRINKS QUICK TRAY */}
          <div className="customer-primary-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-surface-line px-3.5 py-2 bg-surface-raised/30">
              <div className="flex items-center gap-2">
                <span className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <UtensilsCrossed size={13} />
                </span>
                <div>
                  <p className="eyebrow">Cafe Kitchen</p>
                  <h3 className="font-display text-xs font-bold text-ink-900">Food & Drinks Tray</h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMenuOrderOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-500 hover:bg-amber-500/20 transition cursor-pointer h-7"
                >
                  <ShoppingBag size={12} /> Full Menu
                </button>

                {/* Orders Popover Button with Live Pending Dot (After Full Menu) */}
                <div className="relative" ref={ordersDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setOrdersOpen((prev) => !prev)}
                    className={`relative inline-flex items-center justify-center h-7 px-2 rounded-lg border transition cursor-pointer text-xs font-semibold gap-1 ${
                      ordersOpen
                        ? "border-amber-500 bg-amber-500/20 text-ink-900 shadow-sm"
                        : pendingOrdersCount > 0
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                        : "border-surface-line bg-surface-raised/40 text-slate-soft hover:text-ink-900"
                    }`}
                    title={pendingOrdersCount > 0 ? `${pendingOrdersCount} pending kitchen order${pendingOrdersCount === 1 ? '' : 's'}` : "View order queue"}
                    aria-label="View Orders"
                  >
                    <ReceiptText size={13} className={pendingOrdersCount > 0 ? "text-amber-500" : ""} />
                    {pendingOrdersCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-midnight shadow-xs">
                        {pendingOrdersCount}
                      </span>
                    )}
                  </button>

                  {/* Compact Orders Popover */}
                  {ordersOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 rounded-2xl border border-surface-line bg-surface shadow-2xl z-50 overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between border-b border-surface-line px-3.5 py-2 bg-surface-raised/40">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <ReceiptText size={12} />
                          </span>
                          <div>
                            <p className="eyebrow">Queue</p>
                            <h3 className="font-display text-xs font-bold text-ink-900">Kitchen Orders</h3>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-soft px-2 py-0.5 rounded-full bg-surface-raised">
                          {pendingOrdersCount} active / {myOrders.length} total
                        </span>
                      </div>

                      <div className="p-2 max-h-64 overflow-y-auto divide-y divide-surface-line">
                        {myOrders.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-soft">
                            No active or past orders yet.
                          </div>
                        ) : (
                          myOrders.map((order) => {
                            const status = order.order_status || order.orderStatus || "pending";
                            const isPending = status === "pending";
                            const isPreparing = status === "preparing";
                            const isFulfilled = status === "fulfilled";
                            let parsedItems = [];
                            try {
                              parsedItems = typeof order.items_json === "string" ? JSON.parse(order.items_json) : (order.items || []);
                            } catch {
                              parsedItems = [];
                            }
                            return (
                              <div key={order.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                                        isPending
                                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                          : isPreparing
                                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                          : isFulfilled
                                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                          : "bg-slate-800 text-slate-400"
                                      }`}
                                    >
                                      {status}
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-ink-900">
                                      ₱{Number(order.total || 0).toFixed(2)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[10px] text-slate-soft truncate">
                                    {parsedItems.map((i) => `${i.quantity}x ${i.name}`).join(", ") || "Order items"}
                                  </p>
                                </div>
                                {isPending && (
                                  <button
                                    type="button"
                                    disabled={cancellingOrderId === order.id}
                                    onClick={() => handleCancelOrder(order.id)}
                                    className="shrink-0 px-2 py-1 rounded-lg border border-ember/30 bg-ember/10 text-ember-dim font-bold text-[10px] hover:bg-ember/20 transition disabled:opacity-50"
                                  >
                                    {cancellingOrderId === order.id ? "…" : "Cancel"}
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Snacks Tray Items */}
            {menuItems.length > 0 && (
              <div className="p-2.5 border-b border-surface-line/50 space-y-1.5 shrink-0">
                {/* Header & Category Filters */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-soft uppercase tracking-wider">Quick In-Game Snacks</p>
                    <span className="text-[10px] text-slate-soft font-mono">{quickSnackItems.length} items</span>
                  </div>
                  {/* Category Filter Chips with mouse wheel support */}
                  <div
                    onWheel={(e) => {
                      if (e.deltaY !== 0) {
                        e.currentTarget.scrollLeft += e.deltaY;
                      }
                    }}
                    className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none"
                  >
                    {quickSnackCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setQuickCategory(cat)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition whitespace-nowrap cursor-pointer ${
                          quickCategory === cat
                            ? 'bg-gold text-midnight font-black shadow-xs'
                            : 'bg-surface-raised/40 text-slate-soft hover:text-ink-900 border border-surface-line/50'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizontal Scrollable Quick Items Carousel with mouse wheel support */}
                <div
                  onWheel={(e) => {
                    if (e.deltaY !== 0) {
                      e.currentTarget.scrollLeft += e.deltaY;
                    }
                  }}
                  className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none"
                >
                  {quickSnackItems.length === 0 ? (
                    <div className="w-full py-3 text-center text-[11px] text-slate-soft">
                      No items in this category.
                    </div>
                  ) : (
                    quickSnackItems.map((item) => {
                      const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity;
                      const isOutOfStock = stock !== null && stock !== undefined && Number(stock) <= 0;
                      const inCartQty = sidebarCart[item.id] || 0;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => !isOutOfStock && addToSidebarCart(item)}
                          className={`w-28 shrink-0 customer-neutral-surface rounded-xl p-1.5 border border-surface-line/60 flex flex-col justify-between gap-1 text-left transition hover:border-gold/50 cursor-pointer select-none active:scale-[0.98] ${
                            isOutOfStock ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                          title={isOutOfStock ? `${item.name} is out of stock` : `Click to add ${item.name} to tray`}
                        >
                          {/* Photo / Thumbnail */}
                          <div className="relative h-14 w-full rounded-lg overflow-hidden bg-surface-raised/40 flex items-center justify-center border border-surface-line/40 group">
                            {item.image_url || item.imageUrl ? (
                              <img
                                src={item.image_url || item.imageUrl}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <UtensilsCrossed className="w-5 h-5 text-slate-soft/40 group-hover:scale-110 transition-transform" />
                            )}
                            {/* Hover Add Overlay */}
                            {!isOutOfStock && (
                              <div className="absolute inset-0 bg-midnight/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                                + Add
                              </div>
                            )}
                            {/* In-Tray Quantity Badge */}
                            {inCartQty > 0 && (
                              <span className="absolute top-1 right-1 bg-gold text-midnight text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                                {inCartQty}
                              </span>
                            )}
                            {isOutOfStock && (
                              <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-ember-dim px-1 py-0.2 bg-ember/15 rounded border border-ember/25">
                                  Out of Stock
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 px-0.5">
                            <p className="font-bold text-ink-900 text-[11px] truncate" title={item.name}>{item.name}</p>
                            <p className="font-mono text-gold-dim font-bold text-[10px]">₱{Number(item.price || 0).toFixed(2)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* In-Game Tray Cart Bar */}
            {sidebarCartItems.length > 0 && (
              <div className="p-3 bg-gold/5 border-b border-gold/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-900 flex items-center gap-1">
                    <ShoppingBag size={12} className="text-gold-dim" /> Tray ({sidebarCartItems.reduce((acc, i) => acc + i.quantity, 0)})
                  </span>
                  <span className="font-mono text-xs font-bold text-ink-900">₱{sidebarCartTotal.toFixed(2)}</span>
                </div>

                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {sidebarCartItems.map(({ item, quantity }) => (
                    <div key={item.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-ink-900 truncate">{quantity}x {item.name}</span>
                      <div className="flex items-center gap-1 shrink-0 pl-1">
                        <button
                          type="button"
                          onClick={() => removeFromSidebarCart(item.id)}
                          className="h-4.5 w-4.5 rounded border border-surface-line bg-surface-raised hover:bg-surface-line flex items-center justify-center text-[10px] font-bold text-ink-900 transition-colors"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => addToSidebarCart(item)}
                          className="h-4.5 w-4.5 rounded border border-surface-line bg-surface-raised hover:bg-surface-line flex items-center justify-center text-[10px] font-bold text-ink-900 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {!isGuest && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Wallet}
                      disabled={sidebarOrdering || Number(wallet || 0) < sidebarCartTotal}
                      onClick={() => handleSidebarOrder('wallet')}
                      className="w-full text-xs font-semibold py-1.5 justify-center"
                    >
                      Wallet
                    </Button>
                  )}
                  <Button
                    variant="teal"
                    size="sm"
                    icon={Banknote}
                    disabled={sidebarOrdering}
                    onClick={() => handleSidebarOrder('cash')}
                    className={`w-full text-xs font-semibold py-1.5 justify-center ${isGuest ? 'col-span-2' : ''}`}
                  >
                    Cash
                  </Button>
                </div>
              </div>
            )}

            {/* Helper Prompt when tray is empty */}
            {sidebarCartItems.length === 0 && (
              <div className="p-2 text-center text-xs text-slate-soft">
                <p className="text-[10px]">Tap snacks to add to tray · Delivered to your station</p>
              </div>
            )}
          </div>

        </aside>
      </main>


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
        cart={sidebarCart}
        onCartChange={setSidebarCart}
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
