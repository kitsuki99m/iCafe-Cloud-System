import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  Server,
  Lock,
  Cpu,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext.jsx";
import Button from "../common/Button.jsx";
import PasswordInput from "../common/PasswordInput.jsx";
import BackendStatusIndicator from "../common/BackendStatusIndicator.jsx";
import ServerConnectionModal from "../common/ServerConnectionModal.jsx";
import logo from "../../assets/aktura-logo.svg";
import { useBranding } from "../../hooks/useBranding.js";
import { useBackendStatus } from "../../hooks/useBackendStatus.js";
import {
  cloudRequestBusinessAccess,
  cloudRequestRegistrationCaptcha,
  cloudRequestPasswordReset,
  isCloudAdmin,
} from "../../lib/cloudClient.js";
import { apiPost } from "../../lib/api.js";

const inputClass = "admin-login-input";


export default function AdminLoginForm() {
  const cloud = isCloudAdmin();
  const branding = useBranding();
  const { loginAdminPin, loginAdminPassword } = useAuth();
  const { status: backendStatus, retry: retryBackend } = useBackendStatus();
  const [mode, setMode] = useState(() => (cloud ? "password" : "pin"));
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cloudAuthMode, setCloudAuthMode] = useState("signin");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [requestStep, setRequestStep] = useState(1);
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [request, setRequest] = useState({
    ownerName: "",
    businessName: "",
    phone: "",
    location: "",
    expectedStationCount: "20",
    note: "",
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [serverConnectionOpen, setServerConnectionOpen] = useState(false);
  const backendReady = backendStatus === "online";
  const backendUnavailable =
    !cloud && (backendStatus === "offline" || backendStatus === "error");
  const requesting = cloud && cloudAuthMode === "request";
  const missingCredentials = requesting
    ? !username.trim() ||
      !request.ownerName.trim() ||
      !request.businessName.trim()
    : cloud
      ? !username.trim() || !password
      : mode === "pin"
        ? !pin
        : !username.trim() || !password || (mode === "pin_password" && !pin);
  const expectedStations = Number(request.expectedStationCount);
  const requestStepMissing = requesting && (
    requestStep === 1
      ? !request.ownerName.trim() || !request.businessName.trim()
      : requestStep === 2
        ? !username.trim() || !Number.isInteger(expectedStations) || expectedStations < 1 || expectedStations > 10000
        : missingCredentials || !captcha?.captchaChallengeId || !/^[0-9]{6}$/.test(captchaAnswer)
  );

  async function refreshCaptcha() {
    if (!cloud || captchaLoading) return;
    setCaptchaLoading(true);
    try {
      const next = await cloudRequestRegistrationCaptcha();
      setCaptcha(next);
      setCaptchaAnswer("");
    } catch (err) {
      setError(err?.message || "Unable to create verification code.");
    } finally {
      setCaptchaLoading(false);
    }
  }

  useEffect(() => {
    if (requesting && requestStep === 3 && !captcha?.captchaChallengeId && !captchaLoading) refreshCaptcha();
  }, [requesting, requestStep, captcha?.captchaChallengeId]);

  function updateRequest(key, value) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || (!cloud && !backendReady)) return;
    if (requesting && requestStep < 3) {
      if (requestStepMissing) return;
      setError("");
      setMessage("");
      setRequestStep((step) => Math.min(3, step + 1));
      return;
    }
    if (missingCredentials) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (requesting) {
        await cloudRequestBusinessAccess({
          email: username.trim(),
          ...request,
          expectedStationCount: Number(request.expectedStationCount) || 1,
          captchaChallengeId: captcha?.captchaChallengeId,
          captchaAnswer,
        });
        setMessage("Application submitted. We’ll email you after review.");
        setRequest({
          ownerName: "",
          businessName: "",
          phone: "",
          location: "",
          expectedStationCount: "20",
          note: "",
          website: "",
        });
        setUsername("");
        setCaptcha(null);
        setCaptchaAnswer("");
        setRequestStep(1);
      } else {
        const result = cloud
          ? await loginAdminPassword(username.trim(), password)
          : mode === "pin"
            ? await loginAdminPin(pin)
            : await loginAdminPassword(
                username.trim(),
                password,
                mode === "pin_password" ? pin : null,
              );
        if (!result.ok) setError(result.error);
      }
    } catch (err) {
      setError(err?.message || "Unable to continue.");
      if (requesting && ["CAPTCHA_EXPIRED", "CAPTCHA_EXHAUSTED"].includes(String(err?.code || ""))) {
        setCaptcha(null);
        setCaptchaAnswer("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e) {
    if (e?.preventDefault) e.preventDefault();
    const clean = forgotEmail.trim();
    if (!clean) {
      setForgotError(cloud ? "Please enter your email address." : "Please enter your username or email address.");
      return;
    }
    setForgotBusy(true);
    setForgotError("");
    setForgotSuccess("");
    try {
      if (cloud) {
        await cloudRequestPasswordReset(clean);
        setForgotSuccess("Password recovery email sent. Check your inbox for instructions to set a new password.");
      } else {
        const res = await apiPost('/auth/forgot-password', { email: clean });
        setForgotSuccess(res?.message || "If an active staff account exists, recovery instructions have been dispatched.");
      }
    } catch (err) {
      setForgotError(err?.message || "Unable to request password reset.");
    } finally {
      setForgotBusy(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="admin-login-grid"
      >
        <section className="admin-login-context">
          <div>
            <div className="admin-login-brand flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-2 shadow-inner">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {branding.branch || "Aezakmi"}
                </p>
                <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-white">
                  {branding.cafeName || "iCafe"}
                </h1>
              </div>
            </div>
            <div className="admin-login-intro mt-10 max-w-sm">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Admin workspace</span>
              </div>
              <h2 className="font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
                Manage your café.
              </h2>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Authoritative station controls, multi-tier billing, POS kitchen queue, and real-time revenue intelligence.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <span>Hardware-isolated staff session boundary</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Cpu size={14} className="text-slate-400 shrink-0" />
              <span>Café Edge & Cloud Realtime synchronized</span>
            </div>
          </div>
        </section>

        {forgotMode ? (
          <section className="admin-login-card">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Password recovery</p>
                <h2 className="mt-1 font-display text-[24px] font-semibold tracking-[-0.025em] text-ink-900">
                  Forgot password
                </h2>
                <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-slate-soft">
                  {cloud
                    ? "Enter your registered business email to receive recovery instructions."
                    : "Enter your staff email or username to reset your credentials."}
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim">
                <ShieldCheck size={18} />
              </span>
            </div>

            <AnimatePresence mode="wait">
              {forgotError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600"
                >
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{forgotError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {forgotSuccess ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-700">
                  {forgotSuccess}
                </div>
                <button
                  type="button"
                  className="admin-login-submit-btn w-full cursor-pointer"
                  onClick={() => {
                    setForgotMode(false);
                    setForgotSuccess("");
                    setForgotError("");
                  }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="eyebrow mb-2 block">
                    {cloud ? "Registered Email" : "Staff Email or Username"}
                  </label>
                  <input
                    autoFocus
                    type={cloud ? "email" : "text"}
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder={cloud ? "owner@example.com" : "e.g. staff@icafe.ph or username"}
                    className={inputClass}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="admin-login-submit-btn w-full cursor-pointer"
                  disabled={forgotBusy || !forgotEmail.trim()}
                >
                  {forgotBusy ? (
                    "Sending…"
                  ) : (
                    <>
                      <span>Send recovery instructions</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="mt-3 w-full text-center text-xs font-medium text-slate-soft underline cursor-pointer"
                  onClick={() => {
                    setForgotMode(false);
                    setForgotError("");
                    setForgotSuccess("");
                  }}
                >
                  Back to sign in
                </button>
              </form>
            )}

            <p className="mt-4 text-center text-[10px] text-slate-soft">Authorized staff only</p>
          </section>
        ) : (
        <section className="admin-login-card">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">
                {requesting ? "Business access" : "Admin access"}
              </p>
              <h2 className="mt-1 font-display text-[24px] font-semibold tracking-[-0.025em] text-ink-900">
                {requesting ? "Request Cloud access" : "Sign in"}
              </h2>
              <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-slate-soft">
                {cloud
                  ? requesting
                    ? "Approval required before account activation."
                    : "Approved Cloud accounts only."
                  : "Use your configured Admin credentials."}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim">
              <ShieldCheck size={18} />
            </span>
          </div>

          {!cloud && (
            <div className="mb-4 space-y-2">
              <BackendStatusIndicator
                status={backendStatus}
                onRetry={retryBackend}
              />
              <button
                type="button"
                onClick={() => setServerConnectionOpen(true)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 cursor-pointer"
              >
                <Server size={14} /> Server Connection
              </button>
            </div>
          )}
          {requesting && (
            <div className="mb-4">
              <div className="flex items-center gap-2" aria-label={`Registration step ${requestStep} of 3`}>
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${step <= requestStep ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{step}</span>
                    <span className={`hidden truncate text-[10px] font-semibold sm:block ${step === requestStep ? "text-ink-900" : "text-slate-soft"}`}>{step === 1 ? "Business" : step === 2 ? "Contact" : "Review"}</span>
                    {step < 3 && <span className={`h-px min-w-3 flex-1 ${step < requestStep ? "bg-slate-900" : "bg-slate-200"}`} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!cloud && (
            <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("pin");
                  setError("");
                }}
                className={`admin-login-mode-tab relative ${mode === "pin" ? "active" : ""}`}
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
                className={`admin-login-mode-tab relative ${mode === "password" ? "active" : ""}`}
              >
                Username + Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("pin_password");
                  setError("");
                }}
                className={`admin-login-mode-tab relative ${mode === "pin_password" ? "active" : ""}`}
              >
                PIN + Password
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-600 font-medium"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={14} />
                <span>{error}</span>
              </motion.p>
            )}
            {message && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-700 font-medium"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <form onSubmit={submit} className="space-y-4">
            {requesting ? (
              <>
                {requestStep === 1 && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="eyebrow mb-2 block">Owner name</span>
                      <input
                        autoFocus
                        required
                        value={request.ownerName}
                        onChange={(e) => updateRequest("ownerName", e.target.value)}
                        className={inputClass}
                        placeholder="Business owner"
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow mb-2 block">Business / café</span>
                      <input
                        required
                        value={request.businessName}
                        onChange={(e) => updateRequest("businessName", e.target.value)}
                        className={inputClass}
                        placeholder="Kai Gaming Lounge"
                      />
                    </label>
                  </div>
                )}

                {requestStep === 2 && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="eyebrow mb-2 block">Email</span>
                      <input
                        autoFocus
                        required
                        type="email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="email"
                        className={inputClass}
                        placeholder="owner@example.com"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="eyebrow mb-2 block">Phone</span>
                        <input
                          value={request.phone}
                          onChange={(e) => updateRequest("phone", e.target.value)}
                          className={inputClass}
                          placeholder="09xx xxx xxxx"
                        />
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-2 block">Expected PCs</span>
                        <input
                          required
                          type="number"
                          min="1"
                          max="10000"
                          value={request.expectedStationCount}
                          onChange={(e) => updateRequest("expectedStationCount", e.target.value)}
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="eyebrow mb-2 block">City / province</span>
                      <input
                        value={request.location}
                        onChange={(e) => updateRequest("location", e.target.value)}
                        className={inputClass}
                        placeholder="Puerto Princesa, Palawan"
                      />
                    </label>
                  </div>
                )}

                {requestStep === 3 && (
                  <div className="space-y-4">
                    <div className="grid gap-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-xs sm:grid-cols-2">
                      <div className="min-w-0"><span className="eyebrow block">Owner</span><strong className="mt-1 block truncate text-ink-900">{request.ownerName}</strong></div>
                      <div className="min-w-0"><span className="eyebrow block">Business</span><strong className="mt-1 block truncate text-ink-900">{request.businessName}</strong></div>
                      <div className="min-w-0"><span className="eyebrow block">Email</span><strong className="mt-1 block truncate text-ink-900">{username}</strong></div>
                      <div className="min-w-0"><span className="eyebrow block">Expected PCs</span><strong className="mt-1 block text-ink-900">{request.expectedStationCount}</strong></div>
                    </div>
                    <label className="block">
                      <span className="eyebrow mb-2 block">Notes <span className="normal-case tracking-normal text-slate-soft">(optional)</span></span>
                      <textarea
                        rows={3}
                        value={request.note}
                        onChange={(e) => updateRequest("note", e.target.value)}
                        className={`${inputClass} min-h-[84px] py-3`}
                        placeholder="Anything the developer should know?"
                      />
                    </label>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
                      <div>
                        <span className="eyebrow mb-2 block">Verification</span>
                        <button
                          type="button"
                          onClick={refreshCaptcha}
                          disabled={captchaLoading}
                          className="min-h-11 min-w-[112px] rounded-xl border border-surface-line bg-surface-raised px-3 font-mono text-base font-bold tracking-[0.18em] text-ink-900"
                          title="Generate a new code"
                        >
                          {captchaLoading ? "······" : (captcha?.captchaCode || "New code")}
                        </button>
                      </div>
                      <label className="block">
                        <span className="eyebrow mb-2 block">Enter code</span>
                        <input
                          autoFocus
                          required
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={captchaAnswer}
                          onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className={`${inputClass} font-mono tracking-[0.2em]`}
                          placeholder="000000"
                        />
                      </label>
                    </div>
                  </div>
                )}
                <input
                  className="hidden"
                  tabIndex="-1"
                  autoComplete="off"
                  aria-hidden="true"
                  value={request.website}
                  onChange={(e) => updateRequest("website", e.target.value)}
                />
              </>
            ) : !cloud && mode === "pin" ? (
              <motion.div
                key="pin-mode"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label className="eyebrow block">Admin PIN</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setForgotEmail("");
                      setForgotError("");
                      setForgotSuccess("");
                    }}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-900 underline cursor-pointer"
                  >
                    Forgot PIN?
                  </button>
                </div>
                <PasswordInput
                  autoFocus
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, ""))
                  }
                  inputClassName={`${inputClass} text-lg tracking-[0.28em] font-mono`}
                  placeholder="Enter PIN"
                />
              </motion.div>
            ) : (
              <motion.div
                key="password-mode"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label className="eyebrow mb-2 block">
                    {cloud ? "Email" : "Username"}
                  </label>
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="eyebrow block">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(true);
                        setForgotEmail(username);
                        setForgotError("");
                        setForgotSuccess("");
                      }}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-900 underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
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
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="Enter PIN"
                      inputClassName={`${inputClass} tracking-[0.22em] font-mono`}
                    />
                  </div>
                )}
              </motion.div>
            )}

            <div className={requesting && requestStep > 1 ? "grid grid-cols-[auto_minmax(0,1fr)] gap-2" : ""}>
              {requesting && requestStep > 1 && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-transparent px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
                  disabled={busy}
                  onClick={() => { setError(""); setRequestStep((step) => Math.max(1, step - 1)); }}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="admin-login-submit-btn"
                disabled={busy || (!cloud && !backendReady) || (requesting ? requestStepMissing : missingCredentials)}
              >
                {busy ? (
                  requesting ? (
                    "Submitting…"
                  ) : (
                    "Signing in…"
                  )
                ) : !cloud && backendStatus === "connecting" ? (
                  "Connecting…"
                ) : backendUnavailable ? (
                  "Server unavailable"
                ) : requesting ? (
                  <>
                    <span>{requestStep < 3 ? "Next" : "Submit application"}</span>
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    <span>Continue to Admin</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>

          {cloud && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs font-medium text-slate-soft underline cursor-pointer"
              onClick={() => {
                setCloudAuthMode((value) =>
                  value === "signin" ? "request" : "signin",
                );
                setRequestStep(1);
                setCaptcha(null);
                setCaptchaAnswer("");
                setError("");
                setMessage("");
                setPassword("");
              }}
            >
              {requesting
                ? "Already approved? Sign in"
                : "New business? Request access"}
            </button>
          )}

          <p className="mt-4 text-center text-[10px] text-slate-soft">Authorized staff only</p>
        </section>
        )}
      </motion.div>
      {!cloud && (
        <ServerConnectionModal
          open={serverConnectionOpen}
          onClose={() => setServerConnectionOpen(false)}
        />
      )}
    </main>
  );
}
