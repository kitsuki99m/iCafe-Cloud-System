import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CircleDollarSign,
  KeyRound,
  MonitorCheck,
  ShieldCheck,
  Server,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import Button from "../common/Button.jsx";
import PasswordInput from "../common/PasswordInput.jsx";
import BackendStatusIndicator from "../common/BackendStatusIndicator.jsx";
import ServerConnectionModal from "../common/ServerConnectionModal.jsx";
import logo from "../../assets/aktura-logo.svg";
import { useBranding } from "../../hooks/useBranding.js";
import { useBackendStatus } from "../../hooks/useBackendStatus.js";
import { isCloudAdmin } from "../../lib/cloudClient.js";

const inputClass =
  "w-full min-h-11 rounded-xl border border-surface-line bg-soft-white px-3.5 text-sm text-midnight placeholder:text-slate-soft focus:border-midnight/45 focus:outline-none focus:ring-2 focus:ring-midnight/10";

const CONTEXT_ITEMS = [
  { icon: MonitorCheck, title: "Stations", copy: "See PC status and active sessions." },
  { icon: UsersRound, title: "Members", copy: "Manage accounts, wallets, and saved time." },
  { icon: CircleDollarSign, title: "Earnings", copy: "Review revenue, expenses, and reports." },
];

export default function AdminLoginForm() {
  const cloud = isCloudAdmin();
  const branding = useBranding();
  const { loginAdminPin, loginAdminPassword, registerCloud } = useAuth();
  const { status: backendStatus, retry: retryBackend } = useBackendStatus();
  const [mode, setMode] = useState(() => cloud ? "password" : "pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cloudAuthMode, setCloudAuthMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [serverConnectionOpen, setServerConnectionOpen] = useState(false);
  const backendReady = backendStatus === "online";
  const backendUnavailable = !cloud && (backendStatus === "offline" || backendStatus === "error");
  const missingCredentials = cloud ? !username.trim() || !password : (mode === "pin" ? !pin : !username.trim() || !password || (mode === "pin_password" && !pin));

  async function submit(event) {
    event.preventDefault();
    if (busy || (!cloud && !backendReady) || missingCredentials) return;

    setBusy(true);
    setError("");
    setMessage("");
    const result = cloud
      ? (cloudAuthMode === "signup" ? await registerCloud(username.trim(), password) : await loginAdminPassword(username.trim(), password))
      : (mode === "pin" ? await loginAdminPin(pin) : await loginAdminPassword(username.trim(), password, mode === "pin_password" ? pin : null));
    setBusy(false);
    if (!result.ok) setError(result.error);
    else if (cloud && cloudAuthMode === "signup" && result.confirmationRequired) setMessage("Account created. Confirm your email, then sign in to create your café organization.");
  }

  return (
    <main className="admin-login-shell">
      <div className="admin-login-grid">
        <section className="admin-login-context">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-soft-white/15 bg-soft-white/10 p-2">
                <img
                  src={branding.logoUrl || logo}
                  onError={(event) => {
                    event.currentTarget.src = logo;
                  }}
                  className="h-full w-full object-contain"
                  alt=""
                />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-new-wool">
                  {branding.branch || "Cafe branch"}
                </p>
                <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-soft-white">
                  {branding.cafeName || "Aezakmi Cafe"}
                </h1>
              </div>
            </div>

            <div className="mt-10 max-w-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-new-wool">
                Admin workspace
              </p>
              <h2 className="mt-2 font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-soft-white">
                Run cafe operations from one clear workspace.
              </h2>
              <p className="mt-3 text-[13px] leading-6 text-dance">
                Sign in to manage stations, members, rates, earnings, analytics, and cafe settings.
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-2.5">
            {CONTEXT_ITEMS.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[0.06] px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-soft-white/10 text-soft-white">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-soft-white">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-new-wool">{copy}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-center gap-2 text-[11px] text-new-wool">
              <ShieldCheck size={14} />
              <span>Secure access for authorized staff only</span>
            </div>
          </div>
        </section>

        <section className="admin-login-card">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Admin access</p>
              <h2 className="mt-1 font-display text-[24px] font-semibold tracking-[-0.025em] text-ink-900">
                {cloud && cloudAuthMode === "signup" ? "Create Cloud account" : "Sign in to Admin"}
              </h2>
              <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-slate-soft">
                {cloud ? (cloudAuthMode === "signup" ? "Create an owner account using Supabase Auth." : "Use your Aezakmi Cloud owner/staff account.") : "Use the sign-in method configured during first-time security setup."}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim">
              <ShieldCheck size={18} />
            </span>
          </div>

          {!cloud && <div className="mb-4 space-y-2">
            <BackendStatusIndicator status={backendStatus} onRetry={retryBackend} />
            <button type="button" onClick={() => setServerConnectionOpen(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-surface-line bg-dance/20 px-3 text-xs font-semibold text-ink-900 transition-colors hover:bg-dance/40">
              <Server size={14} /> Server Connection
            </button>
          </div>}
          {cloud && <div className="mb-4 rounded-xl border border-teal/20 bg-teal/5 px-3 py-2.5 text-xs text-slate-soft"><span className="font-semibold text-ink-900">Aezakmi Cloud</span> · Sign in with your Supabase owner/staff account.</div>}

          {!cloud && <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-surface-line bg-dance/30 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("pin");
                setError("");
              }}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors ${
                mode === "pin"
                  ? "bg-soft-white text-midnight shadow-card"
                  : "text-slate-soft hover:text-midnight"
              }`}
            >
              <KeyRound className="mr-1.5 inline" size={14} />
              Admin PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError("");
              }}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors ${
                mode === "password"
                  ? "bg-soft-white text-midnight shadow-card"
                  : "text-slate-soft hover:text-midnight"
              }`}
            >
              Username + Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("pin_password");
                setError("");
              }}
              className={`min-h-10 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                mode === "pin_password"
                  ? "bg-soft-white text-midnight shadow-card"
                  : "text-slate-soft hover:text-midnight"
              }`}
            >
              PIN + Password
            </button>
          </div>}

          {error && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs leading-5 text-ember-dim">
              <AlertCircle className="mt-0.5 shrink-0" size={14} />
              {error}
            </p>
          )}
          {message && <p className="mb-4 rounded-xl border border-teal/25 bg-teal/10 px-3 py-2.5 text-xs leading-5 text-teal-dim">{message}</p>}

          <form onSubmit={submit} className="space-y-4">
            {!cloud && mode === "pin" ? (
              <div>
                <label className="eyebrow mb-2 block">Admin PIN</label>
                <PasswordInput
                  autoFocus
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  inputClassName={`${inputClass} text-lg tracking-[0.28em]`}
                  placeholder="Enter PIN"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-slate-soft">
                  Enter the PIN configured for this cafe.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="eyebrow mb-2 block">{cloud ? "Email" : "Username"}</label>
                  <input
                    autoFocus
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder={cloud ? "owner@example.com" : "Admin username"}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Password</label>
                  <PasswordInput
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Password"
                    inputClassName={inputClass}
                  />
                </div>
                {mode === "pin_password" && (
                  <div>
                    <label className="eyebrow mb-2 block">Admin PIN</label>
                    <PasswordInput
                      inputMode="numeric"
                      maxLength={8}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                      placeholder="Enter PIN"
                      inputClassName={`${inputClass} tracking-[0.22em]`}
                    />
                  </div>
                )}
              </>
            )}

            <Button
              type="submit"
              variant="primary"
              className="min-h-11 w-full"
              disabled={
                busy ||
                (!cloud && !backendReady) ||
                missingCredentials
              }
            >
              {busy ? (
                "Signing in…"
              ) : !cloud && backendStatus === "connecting" ? (
                "Connecting…"
              ) : backendUnavailable ? (
                "Server unavailable"
              ) : cloud && cloudAuthMode === "signup" ? (
                <>
                  <span>Create Cloud account</span>
                  <ArrowRight size={16} />
                </>
              ) : (
                <>
                  <span>Continue to Admin</span>
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </form>

          {cloud && <button type="button" className="mt-3 w-full text-center text-xs font-medium text-slate-soft underline" onClick={() => { setCloudAuthMode((value) => value === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
            {cloudAuthMode === "signin" ? "Create a new café owner account" : "Already have an account? Sign in"}
          </button>}

          <div className="mt-5 border-t border-surface-line pt-4">
            <p className="text-center text-[10px] leading-4 text-slate-soft">
              {branding.branch || "Cafe operations"} · Authorized staff only
            </p>
          </div>
        </section>
      </div>
      {!cloud && <ServerConnectionModal open={serverConnectionOpen} onClose={() => setServerConnectionOpen(false)} />}
    </main>
  );
}
