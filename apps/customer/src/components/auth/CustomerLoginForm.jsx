import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Megaphone,
  User,
  UserRound,
  Wifi,
  Sun,
  Moon,
  ShieldCheck,
  Server,
  ArrowRight,
} from "lucide-react";
import Button from "../common/Button.jsx";
import Modal from "../common/Modal.jsx";
import NumericInput from "../common/NumericInput.jsx";
import PasswordInput from "../common/PasswordInput.jsx";
import ServerConnectionModal from "../common/ServerConnectionModal.jsx";
import AdminPinGateModal from "../common/AdminPinGateModal.jsx";
import { apiPost } from "../../lib/api.js";
import logo from "../../assets/aktura-logo.svg";
import { useAuth } from "../../context/AuthContext.jsx";
import { useAppData } from "../../context/AppDataContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useBranding } from "../../hooks/useBranding.js";
import { formatDuration } from "../../lib/duration.js";

export default function CustomerLoginForm() {
  const branding = useBranding();
  const { loginCustomerCredentials, enterGuestMode, clientIp } = useAuth();
  const { settings, announcements = [], ratePlans = [], currentClientPc, serverError } = useAppData();
  const { isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [serverConnectionOpen, setServerConnectionOpen] = useState(false);
  const [serverConnectionUnlocked, setServerConnectionUnlocked] = useState(false);
  const [serverConnectionCandidate, setServerConnectionCandidate] = useState(null);
  const [serverPinGateOpen, setServerPinGateOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState("cash");
  const [gcashNumber, setGcashNumber] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpSent, setTopUpSent] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [idleSeconds, setIdleSeconds] = useState(180);
  const [shutdownSimulated, setShutdownSimulated] = useState(false);
  const shutdownTriggered = useRef(false);

  useEffect(() => {
    let remaining = 180;
    shutdownTriggered.current = false;
    setIdleSeconds(remaining);
    setShutdownSimulated(false);

    const timer = window.setInterval(() => {
      remaining -= 1;
      setIdleSeconds(Math.max(0, remaining));
      if (remaining > 0 || shutdownTriggered.current) return;

      shutdownTriggered.current = true;
      const shutdown = window.aezakmiClient?.shutdownClient;
      if (shutdown) shutdown();
      else {
        setShutdownSimulated(true);
        remaining = 180;
        setIdleSeconds(remaining);
        shutdownTriggered.current = false;
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function run(fn) {
    setBusy(true);
    setError("");
    const r = await fn();
    setBusy(false);
    if (r?.ok) {
      // Remove the login-screen idle-shutdown indicator only after authentication
      // or guest entry actually succeeds. Failed login/guest attempts keep it visible.
      setIdleSeconds(null);
      shutdownTriggered.current = true;
      return;
    }
    if (!r.ok) {
      setError(r.error);
      if (
        r.code === "INSUFFICIENT_BALANCE" ||
        /insufficient balance/i.test(r.error || "")
      )
        setTopUpOpen(true);
    }
  }

  async function requestTopUp() {
    if (
      !username.trim() ||
      !(Number(amount) > 0) ||
      (method === "gcash" && !/^09\d{9}$/.test(gcashNumber.trim()))
    )
      return;
    setTopUpBusy(true);
    setTopUpError("");
    try {
      await apiPost("/public/top-ups", {
        username: username.trim(),
        amount: Math.floor(Number(amount)),
        method,
        gcashNumber: method === "gcash" ? gcashNumber.trim() : null,
      });
      setTopUpSent(true);
      setError("");
      setTopUpError("");
    } catch (e) {
      setTopUpError(e.message || "Unable to send top-up request.");
    } finally {
      setTopUpBusy(false);
    }
  }

  // Show every currently active, customer-visible announcement published by admin.
  // The public API already enforces audience + schedule, so do not arbitrarily
  // truncate the list on the login screen.
  const visibleAnnouncements = announcements
    .filter((a) => a.isActive !== false && a.active !== false);
  const TIER_RANK = { Regular: 0, Gold: 1, VIP: 2 };
  const planTier = (plan) =>
    String(plan?.customerTier || plan?.customer_tier || "Regular");
  const visibleRatePlans = ratePlans
    .filter((plan) => plan?.isActive !== false && plan?.effectiveStatus === "active")
    .sort(
      (a, b) =>
        (TIER_RANK[planTier(a)] ?? 0) - (TIER_RANK[planTier(b)] ?? 0) ||
        String(a?.name || "").localeCompare(String(b?.name || "")),
    );
  const TIER_STYLE = {
    Regular: "bg-teal/10 text-teal-dim",
    Gold: "bg-gold/15 text-gold-dim",
    VIP: "bg-trillium/25 text-grape",
  };

  return (
    <div
      className={`${isDark ? "customer-login-dark " : ""}customer-login-shell`}
    >
      <header className="customer-login-header">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={branding.logoUrl || logo}
            onError={(event) => { event.currentTarget.src = logo }}
            className="h-10 w-10 shrink-0 rounded-xl"
            alt=""
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[18px] font-semibold tracking-tight text-ink-900">
              {branding.cafeName}
            </h1>
            <p className="eyebrow">{branding.branch} · Customer Station</p>
          </div>
        </div>
        <div className="customer-login-actions">
          <button
            type="button"
            onClick={() => {
              setServerConnectionCandidate(null);
              setServerConnectionUnlocked(false);
              setServerPinGateOpen(true);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-surface-line bg-surface px-3.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-dance/35"
            title="Server connection"
          >
            <Server size={15} />
            <span>Server</span>
          </button>
          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-surface-line bg-surface px-3.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-dance/35"
          >
            <Megaphone size={15} />
            <span>Announcements</span>
          </button>
          <button
            type="button"
            onClick={() => setTopUpOpen(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-midnight px-4 text-xs font-semibold text-soft-white transition-colors hover:bg-bluish"
          >
            Top Up
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-surface-line bg-surface text-slate-soft transition-colors hover:bg-dance/35"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <main className="customer-login-grid">
        <div className="contents">
          <section className="customer-primary-card min-h-0 overflow-y-auto p-6 sm:p-7">
            <div className="mb-5">
              <p className="eyebrow">Member access</p>
              <h2 className="mt-1 font-display text-[24px] font-semibold tracking-tight text-ink-900">
                Member sign in
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-soft">
                Enter your cafe username and password. Your Wallet Balance and saved time will appear after you sign in.
              </p>
            </div>
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-teal/25 bg-teal/5 px-4 py-4">
              <div className="rounded-lg bg-teal/10 p-2 text-teal-dim">
                <Wifi size={17} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-900">
                  {serverError ? "Connection required" : "This PC is ready"}
                </p>
                <p className="mt-1 text-xs text-slate-soft">
                  {serverError
                    ? "Cloud and Café Edge are currently unavailable. Cached café information is being shown."
                    : (clientIp || currentClientPc?.ipAddress || "Detecting local IP…")}
                </p>
                <p className="mt-1 text-[11px] text-slate-soft">
                  {serverError
                    ? "Member sign-in and wallet/session changes require Cloud or the cashier/Admin Café Edge."
                    : "You can use one cafe PC at a time with this account."}
                </p>
              </div>
            </div>
            {error && (
              <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-ember/10 px-3 py-2 text-xs text-ember-dim">
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => loginCustomerCredentials(username, password));
              }}
              className="space-y-4"
            >
              <div>
                <label className="eyebrow mb-2 block">Username</label>
                <div className="flex min-h-12 items-center gap-2 rounded-xl border border-surface-line bg-ink px-4 py-2 focus-within:border-teal">
                  <User size={16} className="text-slate-soft" />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your username"
                    className="w-full bg-transparent text-sm text-ink-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="eyebrow mb-2 block">Password</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  inputClassName="min-h-12 w-full rounded-xl border border-surface-line bg-ink px-4 py-2 text-sm text-ink-900 focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                variant="teal"
                className="min-h-12 w-full"
                disabled={!username || !password || busy}
              >
                {busy ? (
                  "Signing in…"
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-midnight/20 bg-midnight/5 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-midnight/10"
            >
              Top Up Wallet
            </button>
            {error && /insufficient balance/i.test(error) && (
              <button
                type="button"
                onClick={() => setTopUpOpen(true)}
                className="mt-3 w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm font-semibold text-gold-dim"
              >
                Top Up Now
              </button>
            )}
            <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-soft">
              <span className="h-px flex-1 bg-surface-line" />
              <span>or</span>
              <span className="h-px flex-1 bg-surface-line" />
            </div>
            <button
              onClick={() => run(enterGuestMode)}
              disabled={busy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-surface-line bg-surface-raised px-3 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-surface"
            >
              <UserRound size={15} />
              Continue as Guest
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-soft">
              Guest mode is available after staff starts a session for this PC.
            </p>
          </section>
          <aside id="customer-login-announcements" className="customer-support-card min-h-0 overflow-y-auto p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone size={15} className="text-gold-dim" />
                <p className="eyebrow text-gold-dim">Announcements</p>
              </div>
              <ShieldCheck size={16} className="text-teal-dim" />
            </div>
            <div className="space-y-2">
              {(visibleAnnouncements.length
                ? visibleAnnouncements
                : [
                    {
                      title: `Welcome to ${branding.cafeName}`,
                      message:
                        "Ask the counter about today’s rates and available promos.",
                      kind: "Promo",
                    },
                    {
                      title: "Need assistance?",
                      message:
                        "Sign in or continue as a guest after staff starts a session.",
                      kind: "Update",
                    },
                  ]
              ).map((item, i) => (
                <div
                  key={item.id || i}
                  className="rounded-lg border border-surface-line bg-surface p-3"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${i % 2 ? "bg-teal/10 text-teal-dim" : "bg-gold/15 text-gold-dim"}`}
                  >
                    {item.kind || item.type || "Update"}
                  </span>
                  <h3 className="mt-2 font-display text-sm font-semibold text-ink-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-soft">
                    {item.message || item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-surface-line pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="eyebrow text-teal-dim">Active rate plans</p>
                <span className="text-[10px] text-slate-soft">{visibleRatePlans.length}</span>
              </div>
              {visibleRatePlans.length ? (
                <div className="space-y-2">
                  {visibleRatePlans.map((plan) => {
                    const isPackage = plan.mode === "package";
                    const amount = Number(plan.amount ?? plan.minAmount ?? 0);
                    const minutes = Number(plan.minutes ?? plan.baseMinutes ?? 0);
                    const pesoUnit = Number(plan.pesoUnit ?? 0);
                    const minutesPerUnit = Number(plan.minutesPerUnit ?? 0);
                    const detail = isPackage
                      ? `₱${Math.floor(amount)} · ${formatDuration(minutes)}`
                      : pesoUnit > 0 && minutesPerUnit > 0
                        ? `₱${Math.floor(pesoUnit)} · ${formatDuration(minutesPerUnit)}`
                        : plan.description || "Available rate";
                    const tier = planTier(plan);
                    return (
                      <div key={plan.id} className="rounded-lg border border-teal/20 bg-teal/5 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display text-sm font-semibold text-ink-900">{plan.name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TIER_STYLE[tier] || TIER_STYLE.Regular}`}
                          >
                            {tier}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-teal-dim">{detail}</p>
                        {plan.description && (
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-soft">{plan.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-soft">No active rate plans are available right now.</p>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Modal
        open={announcementsOpen}
        onClose={() => setAnnouncementsOpen(false)}
        eyebrow="Cafe updates"
        title="Announcements"
        description="Read the latest cafe updates, promos, and notices before you sign in."
        maxWidth="max-w-xl"
        footer={
          <Button variant="primary" onClick={() => setAnnouncementsOpen(false)}>
            Back to Sign In
          </Button>
        }
      >
        <div className="max-h-[54vh] space-y-2 overflow-y-auto pr-1">
          {(visibleAnnouncements.length
            ? visibleAnnouncements
            : [
                {
                  title: `Welcome to ${branding.cafeName}`,
                  message: "Ask the counter about today’s rates and available promos.",
                  kind: "Promo",
                },
                {
                  title: "Need assistance?",
                  message: "Sign in or continue as a guest after staff starts a session.",
                  kind: "Update",
                },
              ]
          ).map((item, index) => (
            <article key={item.id || index} className="rounded-xl border border-surface-line customer-neutral-surface p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-midnight/8 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {item.kind || item.type || "Update"}
                </span>
                {item.createdAt && (
                  <span className="text-[10px] text-slate-soft">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-display text-[15px] font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-1 text-[12px] leading-5 text-slate-soft">{item.message || item.body}</p>
            </article>
          ))}
        </div>
      </Modal>

      <Modal
        open={topUpOpen}
        onClose={() => {
          if (topUpBusy) return;
          setTopUpOpen(false);
          setTopUpSent(false);
          setTopUpError("");
        }}
        eyebrow="Wallet"
        title={topUpSent ? "Top-up request sent" : "Top Up Wallet"}
        description={topUpSent
          ? "Staff will review your request and add the approved amount to your wallet."
          : "Choose an amount and payment method. You can sign in again after staff approves the top-up."}
        maxWidth="max-w-lg"
        busy={topUpBusy}
        footer={!topUpSent ? (
          <>
            <Button
              variant="ghost"
              disabled={topUpBusy}
              onClick={() => {
                if (!topUpBusy) {
                  setTopUpOpen(false);
                  setTopUpError("");
                }
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                topUpBusy ||
                !username.trim() ||
                !(Number(amount) > 0) ||
                (method === "gcash" && !/^09\d{9}$/.test(gcashNumber.trim()))
              }
              onClick={requestTopUp}
            >
              {topUpBusy ? "Sending…" : "Send Top-Up Request"}
            </Button>
          </>
        ) : null}
      >
        {topUpSent ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-teal-dim" size={30} />
            <p className="text-sm font-semibold text-ink-900">Request received</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-slate-soft">
              Wait for staff approval, then sign in again to see your updated Wallet Balance.
            </p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                setTopUpOpen(false);
                setTopUpSent(false);
              }}
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {topUpError && (
              <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-[12px] font-medium text-ember-dim">{topUpError}</p>
            )}
            <div>
              <label className="eyebrow mb-1.5 block">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your cafe username"
                className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 text-sm text-ink-900 outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block">Top-Up Amount</label>
              <NumericInput
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 text-sm text-ink-900 outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block">How will you pay?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("cash")}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${method === "cash" ? "border-gold/50 bg-gold/10 text-gold-dim" : "border-surface-line customer-neutral-surface text-slate-soft"}`}
                >
                  Pay at Counter
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("gcash")}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${method === "gcash" ? "border-gold/50 bg-gold/10 text-gold-dim" : "border-surface-line customer-neutral-surface text-slate-soft"}`}
                >
                  GCash
                </button>
              </div>
            </div>
            {method === "gcash" && (
              <div className="space-y-3 rounded-xl border border-surface-line bg-surface-raised/60 p-3.5">
                <div>
                  <p className="text-[12px] font-semibold text-ink-900">Send GCash to</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{settings.gcashName || "GCash account not configured"}</p>
                  <p className="stat-figure text-[12px] text-slate-soft">{settings.gcashNumber || "Ask the counter for the GCash number."}</p>
                </div>
                <div>
                  <label className="eyebrow mb-1.5 block">Your GCash Number</label>
                  <input
                    value={gcashNumber}
                    onChange={(e) => setGcashNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="09171234567"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 text-sm text-ink-900 outline-none focus:border-gold/50"
                  />
                  {gcashNumber.length > 0 && !/^09\d{9}$/.test(gcashNumber.trim()) && (
                    <p className="mt-1.5 text-[11px] font-medium text-ember-dim">Enter an 11-digit GCash number that starts with 09.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      <AdminPinGateModal
        open={serverPinGateOpen}
        onClose={() => {
          setServerPinGateOpen(false);
        }}
        onVerified={(candidate) => {
          setServerPinGateOpen(false);
          setServerConnectionCandidate(candidate);
          setServerConnectionUnlocked(true);
          setServerConnectionOpen(true);
        }}
      />
      {serverConnectionUnlocked && <ServerConnectionModal
        open={serverConnectionOpen}
        initialConfig={serverConnectionCandidate}
        onClose={() => {
          setServerConnectionOpen(false);
          setServerConnectionUnlocked(false);
          setServerConnectionCandidate(null);
        }}
      />}
      {idleSeconds !== null && (
        <div
          className="fixed bottom-4 left-4 z-[600] w-[min(300px,calc(100vw-2rem))] rounded-xl border border-ember/40 bg-surface p-3.5 shadow-2xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-ember-dim">Idle shutdown</p>
              <p className="mt-1 text-xs text-slate-soft">
                {shutdownSimulated
                  ? "Development mode reset the shutdown timer."
                  : "Sign in before the timer ends or this station will shut down."}
              </p>
            </div>
            <p className="stat-figure text-2xl font-semibold text-ember-dim">
              {idleSeconds}s
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
