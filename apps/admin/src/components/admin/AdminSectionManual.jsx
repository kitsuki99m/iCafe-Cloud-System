import { AlertTriangle, BookOpenText, CheckCircle2, Lightbulb, Route } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'

const MANUALS = {
  Overview: {
    summary: 'Use Overview as the owner’s daily control room. It shows station availability, sessions ending soon, revenue, requests, and recent customer activity without requiring you to open every module.',
    outcome: 'At a glance, you should know whether the cafe is ready to operate, which PCs need attention, and whether any customer or payment request is waiting.',
    steps: [
      { title: 'Start the day with system health', items: ['Confirm the Server/Edge indicator is online or intentionally running in Cloud-only mode.', 'Check Available, In use, and Maintenance counts. An unexpected Offline/Maintenance count should be investigated before opening.', 'Open any warning banner instead of assuming the displayed data is current.'] },
      { title: 'Watch live operations', items: ['Use Floor status to jump directly to a PC that needs attention.', 'Review Sessions ending soon so staff can warn customers or extend time before a session expires.', 'Watch Top-up, support, feedback, and notification indicators for customer requests.'] },
      { title: 'Review the business pulse', items: ['Use Revenue today for a quick operational total, then open Earnings for accounting detail.', 'Use Seven-day revenue for direction only; use Analytics when you need trend comparisons.', 'Check Live cafe activity when you need to understand what just happened on the floor.'] },
      { title: 'Use quick actions for routine work', items: ['Clients manages PCs and active sessions.', 'Members manages customer accounts, wallet balances, tiers, and saved time.', 'Rates controls pricing and session rules.', 'Earnings records and reviews income and expenses.'] },
    ],
    warning: 'Overview is a live summary, not the place to correct historical records. Use Logs to audit events and the owning section to make a change.',
    tips: ['Check Overview at opening, during peak hours, and before closing.', 'If a figure looks unusual, confirm it in Earnings, Analytics, or Logs before changing settings.'],
  },
  Clients: {
    summary: 'Clients is the operating floor. Add and pair Customer Stations here, start sessions, manage active sessions, and perform PC-level actions.',
    outcome: 'Every physical customer PC should map to one logical client, have the correct station identity, and show an accurate availability/session state.',
    steps: [
      { title: 'Register and pair each PC', items: ['Add a PC with a clear label/number and the correct LAN identity used by your branch.', 'For Cloud stations, generate the pairing information and complete pairing on the Customer Station.', 'Do not create duplicate logical PCs for the same physical computer; fix its metadata instead.'] },
      { title: 'Start a customer session', items: ['Choose the target PC, then select a member or use a guest session where allowed.', 'For prepaid sessions, select the correct rate plan or saved member time. For postpaid, confirm the configured postpaid rule first.', 'Verify the customer, amount, billing type, and PC before confirming. The transaction engine treats the confirmed operation as authoritative.'] },
      { title: 'Manage an active session', items: ['Use Add Time to charge against a valid rate plan.', 'Use Reduce/Transfer Time only when you intend to change the customer’s remaining entitlement.', 'Pause/resume, lock, power, maintenance, and other station actions should be used only on the intended PC.', 'When ending prepaid time, choose the correct disposition: save remaining time, forfeit it, or use the available refund flow when appropriate.'] },
      { title: 'Keep the floor clean', items: ['Use status filters to find Available, Occupied, Maintenance, Offline, Reserved, or Locked stations.', 'Put genuinely unavailable hardware into Maintenance rather than leaving it looking available.', 'Remove a PC only after confirming it has no active/reserved session and is no longer part of the branch.'] },
    ],
    warning: 'A PC identity is more important than its display label. Avoid deleting and recreating stations to solve pairing problems because session history and station identity can become harder to trace.',
    tips: ['Use Bulk Add only when deploying several PCs with a predictable addressing pattern.', 'Before moving time or money, read the member/PC name in the confirmation modal twice.'],
  },
  Rates: {
    summary: 'Rates defines what customers can buy and how session time is calculated. It also controls tier eligibility, self-service availability, promotions, and postpaid/session policies.',
    outcome: 'Staff and Customer Stations should always be offered the correct price for the customer tier and billing mode.',
    steps: [
      { title: 'Create the base Regular pricing first', items: ['Create at least one active Regular plan before opening sessions.', 'Choose Linear when pesos scale with time, or Package when the plan has a fixed amount/time bundle.', 'Set minimum amounts and units carefully so Add Time produces the expected minutes.'] },
      { title: 'Add Gold and VIP pricing', items: ['Regular customers use Regular plans.', 'Gold customers can use Regular and Gold plans.', 'VIP customers can use Regular, Gold, and VIP plans.', 'Keep premium plans inactive until you are ready to honor them operationally.'] },
      { title: 'Configure customer self-service and promos', items: ['Enable Customer self-service only for plans customers may purchase without staff selection.', 'For birthday or scheduled promotions, verify date/time/day rules and any redemption limits.', 'Test a promo with a non-production member before advertising it.'] },
      { title: 'Set session-wide rules', items: ['Use Session Policy for defaults and Add Time behavior.', 'Configure Postpaid Rate before staff can safely start postpaid sessions.', 'Deactivate an old plan instead of deleting pricing that may be referenced by historical sessions.'] },
    ],
    warning: 'Changing a rate affects future transactions. Do not edit a plan just to make an old receipt “match”; historical activity should be investigated in Logs/Earnings.',
    tips: ['Keep rate names short and customer-readable.', 'After a pricing change, run one controlled test session and verify the resulting time and amount.'],
  },
  Members: {
    summary: 'Members manages customer accounts: identity, login, tier, wallet balance, saved session time, and account-level transfers.',
    outcome: 'Each returning customer should have one clean account with the correct tier, wallet, and saved-time balance.',
    steps: [
      { title: 'Create a member correctly', items: ['Enter the real customer name and a unique username/member identifier.', 'Record the birthdate when birthday promotions depend on it.', 'Start with the correct tier: Regular, Gold, or VIP. Do not upgrade tiers merely to bypass a rate restriction.'] },
      { title: 'Manage wallet value', items: ['Use top-up/adjustment actions rather than manually changing unrelated session data.', 'Before transferring wallet value, confirm both source and destination member names.', 'A completed wallet operation is financial activity; verify the amount before saving.'] },
      { title: 'Manage saved session time', items: ['Saved time belongs to the member and can resume on a later session.', 'Transfer saved time only when both customers understand the transfer.', 'If a member currently has an active PC session, use the session controls in Clients when the change should affect that live session.'] },
      { title: 'Edit or remove accounts carefully', items: ['Correct profile data from Edit Member.', 'Use inactive/appropriate lifecycle behavior where available instead of deleting accounts that still matter operationally.', 'Before deletion, verify there is no important wallet/session value that must be resolved.'] },
    ],
    warning: 'Wallet balance and saved time are customer value. Treat transfers, deductions, refunds, and manual adjustments like cash-handling operations.',
    tips: ['Search by name or username before creating a new account to avoid duplicates.', 'Use Logs when a customer disputes a balance or time change.'],
  },
  Earnings: {
    summary: 'Earnings is the financial operations view for revenue, expenses, reporting periods, wallet-funded usage context, recurring costs, and management estimates.',
    outcome: 'You should be able to explain where the period’s money came from, what operating costs were recorded, and what the resulting business position looks like.',
    steps: [
      { title: 'Choose the reporting period first', items: ['Set the period before comparing totals so you do not mix daily, monthly, or wider ranges.', 'Use Income snapshot for the main totals in the selected window.', 'Wallet top-ups stay as stored customer credit until spent; wallet-funded sessions/settlements are recognized as revenue when that value is actually consumed.'] },
      { title: 'Record operating expenses', items: ['Use Custom Expense for electricity, supplies, repairs, rent, and similar costs that are not already generated by the system.', 'Write a useful category and note so you can understand the expense months later.', 'Record the expense once; do not duplicate an amount because it appears in another report view.'] },
      { title: 'Configure recurring provisions carefully', items: ['Set recurring ISP amount, due day, and effective dates only when they match the actual business arrangement.', 'Review estimated tax/provision values as management estimates, not filed tax obligations.', 'If the application flags a manual/custom estimate state, verify it with your accountant before relying on it.'] },
      { title: 'Reconcile before closing the period', items: ['Compare unusual income with Logs and session activity.', 'Check GCash/cash/wallet classifications when a payment total looks wrong.', 'Export or record the period only after resolving obvious duplicates or missing entries.'] },
    ],
    warning: 'The tax/provision tools are estimates for management use and are not a substitute for official bookkeeping, BIR filing, or professional tax advice.',
    tips: ['Record expenses on the day they happen.', 'Investigate a mismatch; do not “balance” the report by adding an artificial expense or income item.'],
  },
  Analytics: {
    summary: 'Analytics helps you understand demand, traffic, utilization, member/guest mix, and revenue trends over a selected period.',
    outcome: 'Use trends to decide staffing, opening hours, pricing experiments, promotions, and PC capacity—not to replace accounting records.',
    steps: [
      { title: 'Select a meaningful range', items: ['Use comparable date ranges when measuring whether a change helped.', 'Avoid drawing conclusions from a single unusually busy or quiet day.', 'Make sure the selected period covers the event or promotion you are evaluating.'] },
      { title: 'Read traffic and utilization', items: ['Compare visits/session activity with station capacity.', 'Watch member versus guest mix to understand retention.', 'If visits rise but utilization stays low, inspect operating hours, offline PCs, and session duration.'] },
      { title: 'Read revenue with context', items: ['Compare revenue movement with session volume, not revenue alone.', 'After changing rates, compare both revenue and customer activity before deciding the change worked.', 'Use Earnings for accounting detail when an analytics total needs financial reconciliation.'] },
      { title: 'Turn insights into one controlled change', items: ['Change one major pricing/promo/operating variable at a time where possible.', 'Observe the next comparable period.', 'Use Logs to verify that the operational behavior behind the metric actually occurred.'] },
    ],
    warning: 'Analytics summarizes behavior. A chart can reveal a pattern, but it cannot prove the cause without checking operations and logs.',
    tips: ['Compare weekdays with similar weekdays.', 'Keep notes on when major promotions, outages, or pricing changes started.'],
  },
  Logs: {
    summary: 'Logs is the audit trail for important operational and financial events. Use it to investigate disputes, verify actions, and understand how a record changed.',
    outcome: 'You should be able to trace who/what happened, on which entity or PC, when it happened, and what details were recorded.',
    steps: [
      { title: 'Search before assuming data is wrong', items: ['Search by action, PC, member/customer, or entity information.', 'Use Quick Filters for common session operations.', 'Open the detail panel to read the full recorded payload rather than relying only on the table summary.'] },
      { title: 'Investigate customer disputes', items: ['Find the session start/end or extension event.', 'Compare recorded amount, duration, customer, and PC.', 'For wallet/time disputes, correlate the operation with the member’s current state and related ledger activity.'] },
      { title: 'Investigate staff/system issues', items: ['Look for repeated start/end/extension events that may indicate retries or operational mistakes.', 'Check timestamps around outages or reconnection periods.', 'Use the log as evidence before changing a rate, member balance, or station identity.'] },
      { title: 'Preserve the audit trail', items: ['Treat logs as records, not a workspace to “clean up.”', 'Do not compensate for an incorrect event by editing unrelated settings.', 'When a correction is necessary, make the proper corrective transaction so both the original and correction remain traceable.'] },
    ],
    warning: 'A log entry records what the system received or performed; read the details and surrounding events before assigning a cause.',
    tips: ['Refresh after reproducing an issue so the newest event is visible.', 'Write down the exact time and PC/member when reporting a bug.'],
  },
  Settings: {
    summary: 'Settings contains business identity, payment destination, Customer Station defaults, and account/security controls. Configure this before normal operation.',
    outcome: 'Customers should see the correct cafe identity and payment information, stations should follow the intended defaults, and management credentials should be secure and recoverable.',
    steps: [
      { title: 'Set business branding', items: ['Enter the cafe and branch names you want displayed in Admin, Customer Station, and reports.', 'Upload the correct logo and verify it is readable in both light and dark contexts.', 'Keep branch/location information accurate when you operate more than one site.'] },
      { title: 'Configure payments', items: ['Enter the cafe GCash destination only if you actually accept GCash.', 'Double-check the number before customers begin sending payments.', 'Test one small controlled top-up workflow before advertising the payment option.'] },
      { title: 'Set Customer Station defaults', items: ['Choose the intended default billing behavior.', 'Set the low-time warning early enough for customers to extend without losing work.', 'After changing station behavior, verify one Customer PC before assuming all stations behave as expected.'] },
      { title: 'Secure management access', items: ['Use a strong Admin password and protect the permanent Management PIN used by protected Customer Station controls.', 'Cloud account security and local Edge Management PINs serve different purposes; do not share them with customers.', 'When staff access changes, update credentials promptly and verify the old credential no longer grants management access.'] },
    ],
    warning: 'Settings can change behavior across the entire branch. Make one deliberate change at a time and test it before changing another operational rule.',
    tips: ['Finish Settings, Rates, and Clients setup before opening the cafe to customers.', 'Store recovery information securely outside the customer PCs.'],
  },
  Developer: {
    summary: 'Developer is a platform-owner area for reviewing Aezakmi Cloud business registrations. Normal cafe owners do not need this section.',
    outcome: 'Only valid businesses should be approved for Cloud access, with branch/account ownership verified first.',
    steps: [
      { title: 'Review the registration', items: ['Confirm the business and account details are expected.', 'Check for duplicate or suspicious registrations before approval.'] },
      { title: 'Approve deliberately', items: ['Grant access only after verification.', 'Use the registration state to distinguish pending, approved, and suspended businesses.'] },
    ],
    warning: 'This area controls platform-level access. It should not be delegated to ordinary branch staff.',
    tips: ['Keep approval decisions traceable.', 'Use suspension rather than ad-hoc data deletion when access must be stopped.'],
  },
}

export function hasSectionManual(section) {
  return Boolean(MANUALS[section])
}

export default function AdminSectionManual({ open, onClose, section = 'Overview' }) {
  const manual = MANUALS[section] || MANUALS.Overview

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Owner manual"
      title={`${section} · How to operate this section`}
      description={manual.summary}
      maxWidth="max-w-4xl"
      footer={<Button variant="primary" onClick={onClose}>Got it</Button>}
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-gold/20 bg-gold/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-dim"><Route size={17}/></span>
            <div>
              <p className="eyebrow">What success looks like</p>
              <p className="mt-1 text-sm leading-6 text-ink-900">{manual.outcome}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          {manual.steps.map((step, index) => (
            <section key={step.title} className="overview-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="stat-figure flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-midnight text-[11px] font-bold text-soft-white">{index + 1}</span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-ink-900">{step.title}</h3>
                  <div className="mt-3 space-y-2.5">
                    {step.items.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-slate-soft">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-teal-dim"/>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-ember/20 bg-ember/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ember-dim"/>
            <div>
              <p className="text-[11px] font-semibold text-ink-900">Important</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-soft">{manual.warning}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-[var(--admin-card-subtle)] p-4">
          <div className="flex items-start gap-3">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-gold-dim"/>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink-900">Owner habits</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {manual.tips.map((tip) => <p key={tip} className="flex gap-2 text-[10px] leading-5 text-slate-soft"><BookOpenText size={12} className="mt-1 shrink-0"/><span>{tip}</span></p>)}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  )
}
