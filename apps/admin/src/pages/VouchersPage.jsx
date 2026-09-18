import { useState, useMemo } from 'react'
import {
  Ticket,
  Plus,
  Trash2,
  Calendar,
  Clock3,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import { AdminEmptyState, AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'

const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

export default function VouchersPage() {
  const { vouchers, createVoucher, deleteVoucher } = useAppData()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTargetVoucher, setDeleteTargetVoucher] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [code, setCode] = useState('')
  const [benefitType, setBenefitType] = useState('wallet_credit') // 'wallet_credit' | 'session_time'
  const [valueAmount, setValueAmount] = useState('50')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  function handleCopy(c, id) {
    navigator.clipboard.writeText(c)
    setCopiedId(id)
    showToast({ title: 'Code Copied', message: `Copied "${c}" to clipboard.` })
    setTimeout(() => setCopiedId(null), 2000)
  }

  function generateRandomCode() {
    const prefix = 'PROMO'
    const random = Math.random().toString(36).substring(2, 7).toUpperCase()
    const generated = `${prefix}-${random}`
    setCode(generated)
    return generated
  }

  function openCreateModal() {
    generateRandomCode()
    setValueAmount(benefitType === 'wallet_credit' ? '50' : '60')
    setMaxRedemptions('')
    setExpiresAt('')
    setModalOpen(true)
  }

  async function handleCreateVoucher(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!code.trim() || !(Number(valueAmount) > 0)) {
      showToast({ title: 'Invalid Input', message: 'Please enter a voucher code and value amount greater than 0.', tone: 'error' })
      return
    }
    setSubmitting(true)
    try {
      // If benefitType is session_time, convert minutes input to seconds for backend storage
      const finalValue = benefitType === 'session_time' ? Math.round(Number(valueAmount) * 60) : Number(valueAmount)
      await createVoucher({
        code: code.trim().toUpperCase(),
        benefitType,
        valueAmount: finalValue,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
      showToast({ title: 'Voucher Created', message: `Code ${code.toUpperCase()} is active.` })
      setCode('')
      setValueAmount('50')
      setMaxRedemptions('')
      setExpiresAt('')
      setModalOpen(false)
    } catch (err) {
      showToast({ title: 'Failed to create voucher', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  function promptDeleteVoucher(v) {
    setDeleteTargetVoucher(v)
  }

  async function confirmDeleteVoucher() {
    if (!deleteTargetVoucher) return
    setActionBusy(true)
    try {
      await deleteVoucher(deleteTargetVoucher.id)
      showToast({ title: 'Voucher Deactivated', message: deleteTargetVoucher.code, tone: 'warning' })
      setDeleteTargetVoucher(null)
    } catch (err) {
      showToast({ title: 'Deactivation Failed', message: err.message, tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  const activeVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      const redemptions = Number(v.current_redemptions || v.currentRedemptions || 0)
      const max = v.max_redemptions || v.maxRedemptions
      const isExhausted = max != null && redemptions >= Number(max)
      const isExpired = v.expires_at && new Date(v.expires_at).getTime() < Date.now()
      return !isExhausted && !isExpired
    })
  }, [vouchers])

  const filteredVouchers = useMemo(() => {
    if (!searchQuery.trim()) return vouchers
    return vouchers.filter((v) => v.code?.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [vouchers, searchQuery])

  return (
    <AdminPageWorkspace
      aside={
        <>
          <AdminRailCard title="Promo Stats">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Active Vouchers</span>
                <span className="font-semibold text-teal-dim stat-figure text-sm">{activeVouchers.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Total Issued</span>
                <span className="font-semibold text-ink-900 stat-figure text-sm">{vouchers.length}</span>
              </div>
            </div>
          </AdminRailCard>

          <AdminRailCard title="Redemption Tips">
            <p className="text-xs leading-5 text-slate-soft">
              Customers can enter promo voucher codes on their station kiosk during active sessions or at login to claim free wallet balance or session minutes.
            </p>
          </AdminRailCard>
        </>
      }
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-ink-900 flex items-center gap-2.5">
              <Ticket className="w-5 h-5 text-gold-dim" />
              Promo Vouchers & Gift Codes
            </h1>
            <p className="text-xs text-slate-soft mt-0.5">
              Issue promotional wallet credits or bonus session time for events, social promos, and tournaments.
            </p>
          </div>
          <Button
            variant="primary"
            icon={Plus}
            onClick={openCreateModal}
          >
            Create Voucher
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <AdminMetricCard
            label="Active Codes"
            value={activeVouchers.length}
            icon={Ticket}
            tone={activeVouchers.length > 0 ? 'success' : 'neutral'}
          />
          <AdminMetricCard
            label="Total Vouchers"
            value={vouchers.length}
            icon={Sparkles}
            tone="neutral"
          />
          <AdminMetricCard
            label="Expired / Exhausted"
            value={Math.max(0, vouchers.length - activeVouchers.length)}
            icon={Clock3}
            tone="neutral"
          />
        </div>

        {/* Search Toolbar */}
        {vouchers.length > 0 && (
          <div className="flex justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-soft absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search voucher code…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-surface-line customer-neutral-surface pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
              />
            </div>
          </div>
        )}

        {/* Vouchers List */}
        {filteredVouchers.length === 0 ? (
          <AdminEmptyState
            icon={Ticket}
            title="No Promo Vouchers Found"
            description="Create promo codes that customers can enter on their station kiosk to claim free credits or time."
            action={
              <Button
                variant="primary"
                icon={Plus}
                onClick={openCreateModal}
              >
                Create First Voucher
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredVouchers.map((v) => {
              const isTime = v.benefit_type === 'session_time' || v.benefitType === 'session_time'
              const value = Number(v.value_amount || v.valueAmount || 0)
              const redemptions = Number(v.current_redemptions || v.currentRedemptions || 0)
              const max = v.max_redemptions || v.maxRedemptions
              const isExhausted = max != null && redemptions >= Number(max)
              const isExpired = v.expires_at && new Date(v.expires_at).getTime() < Date.now()

              return (
                <div
                  key={v.id}
                  className={`rounded-2xl border p-4 transition flex flex-col justify-between ${
                    isExhausted || isExpired
                      ? 'border-surface-line customer-neutral-surface opacity-60'
                      : 'border-surface-line customer-neutral-surface hover:border-gold/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-line">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-ink-900 tracking-wider bg-surface-raised px-2 py-0.5 rounded-lg border border-surface-line">
                          {v.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(v.code, v.id)}
                          className="p-1 rounded-md text-slate-soft hover:text-ink-900 hover:bg-dance/35 transition"
                          title="Copy Code"
                        >
                          {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-teal-dim" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          isExpired
                            ? 'bg-ember/15 text-ember-dim border border-ember/25'
                            : isExhausted
                            ? 'bg-gold/15 text-gold-dim border border-gold/25'
                            : 'bg-teal/15 text-teal-dim border border-teal/25'
                        }`}
                      >
                        {isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active'}
                      </span>
                    </div>

                    <div className="py-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-soft">Benefit Gift:</span>
                        <span className="font-bold text-gold-dim stat-figure text-xs">
                          {isTime ? `${Math.round(value / 60)} Mins Time` : `+₱${value.toFixed(2)} Wallet Credit`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-soft">Redemptions:</span>
                        <span className="font-mono text-ink-900 text-xs">
                          {redemptions} / {max != null ? max : '∞ Unlimited'}
                        </span>
                      </div>

                      {v.expires_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-soft">Expires:</span>
                          <span className="text-slate-soft text-xs">
                            {new Date(v.expires_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-surface-line/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => promptDeleteVoucher(v)}
                      className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 transition"
                      title="Deactivate Voucher"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Promo campaign"
        title="Create Promo Voucher"
        description="Generate a gift code for bonus wallet funds or session minutes."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateVoucher} disabled={submitting || !code.trim() || !(Number(valueAmount) > 0)}>
              {submitting ? 'Creating…' : 'Create Voucher'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateVoucher} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="eyebrow block">Voucher Code <span className="text-ember-dim">*</span></label>
              <button
                type="button"
                onClick={generateRandomCode}
                className="text-[11px] font-semibold text-gold-dim hover:underline"
              >
                Generate Random
              </button>
            </div>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER-2026"
              className={`${inputClass} font-mono uppercase`}
            />
          </div>

          <div>
            <label className="eyebrow mb-1.5 block">Benefit Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setBenefitType('wallet_credit')
                  if (valueAmount === '60') setValueAmount('50')
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  benefitType === 'wallet_credit'
                    ? 'bg-gold/15 border-gold/35 text-gold-dim'
                    : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                }`}
              >
                Wallet Balance (₱)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBenefitType('session_time')
                  if (valueAmount === '50') setValueAmount('60')
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  benefitType === 'session_time'
                    ? 'bg-gold/15 border-gold/35 text-gold-dim'
                    : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                }`}
              >
                Session Time (Minutes)
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="eyebrow block">
                {benefitType === 'wallet_credit' ? 'Wallet Credit Amount (₱) *' : 'Session Time (Minutes) *'}
              </label>
            </div>
            <NumericInput
              min="1"
              step={benefitType === 'wallet_credit' ? '0.01' : '1'}
              required
              value={valueAmount}
              onChange={(e) => setValueAmount(e.target.value)}
              placeholder={benefitType === 'wallet_credit' ? '50.00' : '60'}
              className={inputClass}
            />

            {/* Quick Presets */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {benefitType === 'wallet_credit' ? (
                ['20', '50', '100', '200', '500'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setValueAmount(amt)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border transition ${
                      valueAmount === amt
                        ? 'bg-gold/20 border-gold/40 text-gold-dim'
                        : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    +₱{amt}
                  </button>
                ))
              ) : (
                [
                  { label: '30m', mins: '30' },
                  { label: '1 hour (60m)', mins: '60' },
                  { label: '2 hours (120m)', mins: '120' },
                  { label: '3 hours (180m)', mins: '180' },
                  { label: '5 hours (300m)', mins: '300' },
                ].map((item) => (
                  <button
                    key={item.mins}
                    type="button"
                    onClick={() => setValueAmount(item.mins)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border transition ${
                      valueAmount === item.mins
                        ? 'bg-gold/20 border-gold/40 text-gold-dim'
                        : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow mb-1.5 block">Max Uses (Limit)</label>
              <input
                type="number"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block">Expiry Date</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* DEACTIVATE VOUCHER CONFIRMATION */}
      <ConfirmModal
        open={Boolean(deleteTargetVoucher)}
        title="Deactivate Promo Voucher"
        description={`Are you sure you want to deactivate voucher code "${deleteTargetVoucher?.code}"? Customers will no longer be able to redeem this voucher.`}
        confirmLabel={actionBusy ? 'Deactivating…' : 'Deactivate Voucher'}
        confirmTone="danger"
        disabled={actionBusy}
        onConfirm={confirmDeleteVoucher}
        onClose={() => setDeleteTargetVoucher(null)}
      />
    </AdminPageWorkspace>
  )
}
