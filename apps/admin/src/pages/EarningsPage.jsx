import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { CircleDollarSign, Download, Plus, ReceiptText, RefreshCw, TriangleAlert, TrendingUp, WalletCards, Mail, Send } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { connectSocket } from '../lib/socket.js'
import { cloudBranchId, isCloudAdmin } from '../lib/cloudClient.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { showToast } from '../lib/toast.js'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import Button from '../components/common/Button.jsx'
import { AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'
import defaultAezakmiLogoSvg from '../assets/aktura-logo.svg?raw'

// jsPDF's built-in Helvetica font maps ₱ to ±. Use the unambiguous Peso code
// in exported reports until a Unicode PDF font is embedded.
const money=value=>`PHP ${Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const inputClass='w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold/50'

function svgFromDataUrl(dataUrl){const raw=String(dataUrl||''),body=raw.split(',').slice(1).join(',');return /;base64,/i.test(raw)?atob(body):decodeURIComponent(body)}
async function addReportLogo(doc,logoDataUrl){
  const logo=String(logoDataUrl||'')
  if(logo.startsWith('data:image/png')){doc.addImage(logo,'PNG',14,12,12,12);return}
  if(/^data:image\/(?:jpeg|jpg)/i.test(logo)){doc.addImage(logo,'JPEG',14,12,12,12);return}
  const markup=logo.startsWith('data:image/svg')?svgFromDataUrl(logo):defaultAezakmiLogoSvg
  const {svg2pdf}=await import('svg2pdf.js')
  const svg=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement
  await svg2pdf(svg,doc,{x:14,y:12,width:12,height:12})
}

async function downloadReport(reportId){
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);const {report,branding}=await apiGet(`/earnings/reports/${reportId}/pdf-data`);const doc=new jsPDF({unit:'mm',format:'a4'});const width=doc.internal.pageSize.getWidth()
  await addReportLogo(doc,branding.logoDataUrl);doc.setFontSize(14);doc.setTextColor(20);doc.setFont('helvetica','bold');doc.text(branding.cafeName||'Aezakmi Cafe',30,17);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(90);doc.text([branding.branch||'Davao Branch',branding.branchLocation||''].filter(Boolean).join(' · '),30,22)
  doc.setTextColor(20);doc.setFontSize(9);doc.text(`REPORT ${report.reportNumber}`,width-14,16,{align:'right'});doc.setTextColor(100);doc.text(dayjs(report.createdAt).format('MMM D, YYYY h:mm A [PHT]'),width-14,21,{align:'right'});doc.setDrawColor(225);doc.line(14,29,width-14,29);doc.setFontSize(16);doc.setFont('helvetica','bold');doc.setTextColor(20);doc.text('Earnings report',14,39);doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(100);doc.text(`${report.bounds.label} · ${report.bounds.period.toUpperCase()}`,14,45)
  const cards=[['Gross income',money(report.summary.gross)],['Expenses',money(report.summary.expenses)],['Net income',money(report.summary.net)]];cards.forEach((item,index)=>{const x=14+index*55;doc.setFontSize(7);doc.setTextColor(110);doc.text(item[0].toUpperCase(),x,57);doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(20);doc.text(item[1],x,65);doc.setFont('helvetica','normal')})
  autoTable(doc,{startY:76,head:[['Revenue source','Amount']],body:Object.entries(report.categories||{}).map(([key,value])=>[key.replaceAll('_',' '),money(value)]),theme:'plain',styles:{fontSize:8,cellPadding:2.2,lineColor:[220,220,220],lineWidth:{bottom:0.15}},headStyles:{textColor:[20,24,32],fontStyle:'bold',lineColor:[20,24,32],lineWidth:{bottom:0.3}}});autoTable(doc,{startY:doc.lastAutoTable.finalY+6,head:[['Expense','Note','Amount']],body:(report.expenses||[]).map(row=>[row.category,row.description||'—',money(row.amount)]),theme:'plain',styles:{fontSize:8,cellPadding:2.1,lineColor:[220,220,220],lineWidth:{bottom:0.15}},headStyles:{textColor:[20,24,32],fontStyle:'bold',lineColor:[20,24,32],lineWidth:{bottom:0.3}}})
  const tax=report.taxEstimate;let y=doc.lastAutoTable.finalY+8;if(y>260){doc.addPage();y=18}doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(20);doc.text('Estimated tax provision — not a filed tax return',14,y);doc.setFont('helvetica','normal');doc.setTextColor(90);doc.setFontSize(8);doc.text(`Gross YTD ${money(tax.grossYtd)} · taxable base ${money(tax.taxableGross)} · rate ${tax.ratePercent}% · liability ${money(tax.estimatedLiability)}`,14,y+5)
  const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);doc.setFontSize(7);doc.setTextColor(130);doc.text(`Generated by ${branding.cafeName||'Aezakmi Cafe'} · ${report.reportNumber}`,14,291);doc.text(`${page} / ${pages}`,width-14,291,{align:'right'})}doc.save(`${report.reportNumber}.pdf`)
}

export default function EarningsPage(){
  const { user } = useAuth()
  const { sendEmailSummary } = useAppData()
  const [period,setPeriod]=useState('monthly'),[date,setDate]=useState(dayjs().format('YYYY-MM-DD')),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState(null),[saving,setSaving]=useState(false),[walletPage,setWalletPage]=useState(1)
  const [voidTarget,setVoidTarget]=useState(null)
  const [custom,setCustom]=useState({category:'',amount:'',description:''}),[fixed,setFixed]=useState({ispMonthly:'',dueDay:'1',effectiveFrom:dayjs().startOf('month').format('YYYY-MM-DD'),effectiveUntil:'',taxRatePercent:'8',confirmManual:false}),[estimate,setEstimate]=useState(null)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailPeriod, setEmailPeriod] = useState('daily')
  const [sendingEmail, setSendingEmail] = useState(false)
  const loadSequenceRef=useRef(0),estimateSequenceRef=useRef(0)
  const cacheKey=useMemo(()=>user?`earnings:${isCloudAdmin()?`cloud:${user.id}:${cloudBranchId()||'unselected'}`:`local:${user.id}`}:${period}:${date}`:null,[user,period,date])
  const load=useCallback(async()=>{
    const requestId=++loadSequenceRef.current
    setLoading(true);setError('')
    try{
      const result=await apiGet(`/earnings?period=${period}&date=${date}`)
      if(requestId !== loadSequenceRef.current)return
      setData(result)
      if(cacheKey) void writeSnapshot(cacheKey,result)
    }catch(err){
      if(requestId !== loadSequenceRef.current)return
      setError(err.message||'Unable to load earnings.')
    }finally{
      if(requestId === loadSequenceRef.current)setLoading(false)
    }
  },[period,date,cacheKey])
  useEffect(()=>{let active=true;if(cacheKey)void readSnapshot(cacheKey).then(snapshot=>{if(active&&snapshot){setData(snapshot);setLoading(false)}}).finally(()=>{if(active)void load()});else void load();return()=>{active=false;loadSequenceRef.current += 1}},[load,cacheKey])
  useEffect(()=>{
    if (isCloudAdmin()) {
      const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},60000)
      return()=>clearInterval(timer)
    }
    const socket=connectSocket();let timer=null
    const onChanged=()=>{clearTimeout(timer);timer=setTimeout(()=>void load(),100)}
    socket.on('data:changed',onChanged)
    return()=>{clearTimeout(timer);socket.off('data:changed',onChanged)}
  },[load])
  useEffect(()=>{
    const requestId=++estimateSequenceRef.current
    if(modal!=='fixed'||fixed.taxRatePercent===''){setEstimate(null);return undefined}
    const rate=Number(fixed.taxRatePercent)
    if(!Number.isFinite(rate)||rate<0||rate>100){setEstimate(null);return undefined}
    const timer=setTimeout(()=>apiGet(`/tax-estimate?date=${date}&rate=${encodeURIComponent(fixed.taxRatePercent)}`)
      .then(result=>{if(requestId !== estimateSequenceRef.current)return;setEstimate(result.estimate)})
      .catch(err=>{if(requestId !== estimateSequenceRef.current)return;setError(err.message)}),180)
    return()=>{clearTimeout(timer);if(requestId===estimateSequenceRef.current)estimateSequenceRef.current += 1}
  },[modal,date,fixed.taxRatePercent])
  const categories=useMemo(()=>Object.entries(data?.categories||{}).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])),[data])
  const walletActivity=data?.walletActivity||[]
  const walletPageSize=8
  const walletPages=Math.max(1,Math.ceil(walletActivity.length/walletPageSize))
  const walletPageSafe=Math.min(walletPage,walletPages)
  const visibleWalletActivity=useMemo(()=>walletActivity.slice((walletPageSafe-1)*walletPageSize,walletPageSafe*walletPageSize),[walletActivity,walletPageSafe])
  useEffect(()=>{setWalletPage(1)},[period,date])
  useEffect(()=>{if(walletPage>walletPages)setWalletPage(walletPages)},[walletPage,walletPages])
  async function saveCustom(){const amount=Number(custom.amount);if(saving||!custom.category.trim()||!Number.isFinite(amount)||amount<=0)return;setSaving(true);try{await apiPost('/expenses',{kind:'custom',category:custom.category.trim(),description:custom.description.trim(),amount,recordedAt:`${date}T12:00:00+08:00`});setCustom({category:'',amount:'',description:''});setModal(null);await load()}catch(err){setError(err.message)}finally{setSaving(false)}}
  async function saveFixed(){const rate=Number(fixed.taxRatePercent),isp=fixed.ispMonthly===''?0:Number(fixed.ispMonthly),dueDay=Number(fixed.dueDay);if(saving||!Number.isFinite(rate)||rate<0||rate>100||!Number.isFinite(isp)||isp<0||!Number.isInteger(dueDay)||dueDay<1||dueDay>28)return;setSaving(true);try{await apiPut('/expenses/fixed-definitions/isp',{monthlyAmount:isp,dueDay,effectiveFrom:fixed.effectiveFrom,effectiveUntil:fixed.effectiveUntil||null});await apiPost('/expenses/fixed-provisions',{month:date.slice(0,7),taxRatePercent:rate,confirmManual:fixed.confirmManual});setModal(null);await load()}catch(err){setError(err.message);if(err.data?.estimate)setEstimate(err.data.estimate)}finally{setSaving(false)}}
  async function createReport(){if(saving)return;setSaving(true);try{const result=await apiPost('/earnings/reports',{period,date});await downloadReport(result.report.id)}catch(err){setError(err.message||'Unable to generate report.')}finally{setSaving(false)}}
  async function voidExpense(){if(saving||!voidTarget?.id)return;setSaving(true);try{await apiDelete(`/expenses/${voidTarget.id}`);setVoidTarget(null);await load()}catch(err){setError(err.message)}finally{setSaving(false)}}
  const periodLabel = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly', ytd: 'Year to date' }[period] || period
  const expenseCount = data?.expenses?.length || 0
    async function handleSendEmailSummary(e) {
      if (e) e.preventDefault()
      setSendingEmail(true)
      try {
        const res = await sendEmailSummary(emailPeriod, emailRecipient)
        showToast({
          title: res?.emailSent ? 'Summary Email Sent' : 'Summary Report Generated',
          message: res?.message || `Summary report for ${emailPeriod} generated.`,
          tone: res?.emailSent ? 'success' : 'default',
        })
        setModal(null)
      } catch (err) {
        showToast({ title: 'Email Delivery Failed', message: err.message, tone: 'error' })
      } finally {
        setSendingEmail(false)
      }
    }

    const earningsRail = <>
    <AdminRailCard title="Income snapshot">
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">Gross income</span><b className="stat-figure text-ink-900">{money(data?.summary?.gross)}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Expenses</span><b className="stat-figure text-ember-dim">{money(data?.summary?.expenses)}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Net income</span><b className="stat-figure text-teal-dim">{money(data?.summary?.net)}</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Reporting period">
      <div className="admin-segmented-control grid grid-cols-2">
        {[['daily','Daily'],['monthly','Monthly'],['yearly','Yearly'],['ytd','YTD']].map(([value,label])=><button key={value} onClick={()=>setPeriod(value)} className={`rounded-md px-2.5 py-2 text-[10px] font-semibold ${period===value?'bg-midnight text-soft-white':'text-slate-soft hover:text-ink-900'}`}>{label}</button>)}
      </div>
      <label className="mt-3 block"><span className="eyebrow mb-1.5 block">Reference date</span><input type="date" value={date} onChange={event=>setDate(event.target.value)} className={`${inputClass} text-xs`}/></label>
    </AdminRailCard>
    <AdminRailCard title="Member payment receipts" action={<WalletCards size={15} className="text-midnight"/>}>
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">Starting wallets</span><b className="stat-figure text-ink-900">{money(data?.categories?.initial_wallet)}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Wallet top-ups</span><b className="stat-figure text-ink-900">{money(data?.categories?.wallet_top_up)}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Included in gross</span><b className="stat-figure text-ink-900">{money(data?.summary?.walletFunding)}</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Period context">
      <div className="admin-rail-stat"><span className="text-slate-soft">Window</span><b className="text-right text-xs font-semibold text-ink-900">{periodLabel}</b></div>
      <div className="admin-rail-stat mt-2"><span className="text-slate-soft">Reference</span><b className="stat-figure text-ink-900">{date}</b></div>
    </AdminRailCard>
  </>

  return <AdminPageWorkspace aside={earningsRail}><h1 className="sr-only">Earnings</h1>
    {error&&<div className="mb-4 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">{error}</div>}
    <div className="admin-metric-grid mb-3">
      <AdminMetricCard label="Gross income" value={money(data?.summary?.gross)} icon={CircleDollarSign} tone="success"/>
      <AdminMetricCard label="Expenses" value={money(data?.summary?.expenses)} icon={ReceiptText} tone="danger"/>
      <AdminMetricCard label="Net income" value={money(data?.summary?.net)} icon={TrendingUp} tone="success"/>
    </div>

    <section className="earnings-primary-actions mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-line bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 hidden sm:inline">Reporting tools:</span>
        <Button variant="subtle" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
        <Button variant="subtle" icon={Mail} onClick={()=>setModal('email_summary')}>Email Summary</Button>
        <Button variant="primary" icon={Download} onClick={createReport} disabled={saving||loading}>{saving?'Working…':'Generate PDF'}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 hidden sm:inline">Expense controls:</span>
        <Button variant="subtle" icon={ReceiptText} onClick={()=>setModal('fixed')}>Fixed expenses</Button>
        <Button variant="primary" icon={Plus} onClick={()=>setModal('custom')}>Add expense</Button>
      </div>
    </section>

    <section className="overview-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Revenue sources</p><h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink-900">Gross income</h2></div>
        <span className="rounded-full bg-surface-raised px-3 py-1.5 text-[10px] font-semibold text-slate-soft">{categories.length} source{categories.length===1?'':'s'}</span>
      </div>
      {categories.length?<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{categories.map(([key,value])=><div key={key} className="overview-soft-card flex items-center justify-between gap-3 px-3 py-3 text-xs"><span className="capitalize text-slate-soft">{key.replaceAll('_',' ')}</span><b className="stat-figure text-ink-900">{money(value)}</b></div>)}</div>:<Empty>No revenue for this period.</Empty>}
    </section>

    <section className="overview-card mt-3 max-w-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-surface-line px-5 py-4"><div><p className="eyebrow">Wallet activity</p><h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink-900">Money movements</h2></div><span className="rounded-full bg-surface-raised px-3 py-1.5 text-[10px] font-semibold text-slate-soft">{walletActivity.length}</span></div>
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead><tr className="border-b border-surface-line text-left text-[10px] uppercase tracking-[0.1em] text-slate-soft"><th className="px-5 py-3">Type</th><th className="px-4 py-3">Date</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody>{walletActivity.length?visibleWalletActivity.map(row=><tr key={row.id} className="border-b border-surface-line/60"><td className="px-5 py-3 font-semibold capitalize text-ink-900">{String(row.type).replaceAll('_',' ')}</td><td className="px-4 py-3 text-slate-soft">{dayjs(row.recorded_at).format('MMM D, YYYY')}</td><td className={`stat-figure px-5 py-3 text-right font-semibold ${row.amount<0?'text-ember-dim':'text-teal-dim'}`}>{money(row.amount)}</td></tr>):<tr><td colSpan="3"><Empty>No wallet activity for this period.</Empty></td></tr>}</tbody></table></div>
      {walletActivity.length? <div className="flex flex-col gap-2 border-t border-surface-line px-5 py-3 text-[11px] text-slate-soft sm:flex-row sm:items-center sm:justify-between"><span>Showing {Math.min((walletPageSafe-1)*walletPageSize+1,walletActivity.length)}–{Math.min(walletPageSafe*walletPageSize,walletActivity.length)} of {walletActivity.length} record{walletActivity.length===1?'':'s'}</span><div className="flex items-center gap-2 self-end sm:self-auto"><span>Page {walletPageSafe} of {walletPages}</span><button type="button" onClick={()=>setWalletPage(value=>Math.max(1,value-1))} disabled={walletPageSafe<=1} className="rounded-lg border border-surface-line px-2.5 py-1.5 font-semibold text-ink-900 transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" onClick={()=>setWalletPage(value=>Math.min(walletPages,value+1))} disabled={walletPageSafe>=walletPages} className="rounded-lg border border-surface-line px-2.5 py-1.5 font-semibold text-ink-900 transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div> : null}
    </section>

    <section className="earnings-expense-log overview-card mt-3 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-surface-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="eyebrow">Operating costs</p><h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink-900">Expense logs</h2></div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-surface-raised px-3 py-1.5 text-[10px] font-semibold text-slate-soft">{expenseCount} record{expenseCount===1?'':'s'}</span><Button variant="subtle" icon={Plus} onClick={()=>setModal('custom')}>Add expense</Button></div>
      </div>
      <div className="grid gap-px border-b border-surface-line bg-surface-line sm:grid-cols-3">
        <div className="bg-surface px-5 py-3"><p className="eyebrow">Recorded expenses</p><p className="stat-figure mt-1 text-base font-bold text-ink-900">{money(data?.summary?.expenses)}</p></div>
        <div className="bg-surface px-5 py-3"><p className="eyebrow">Tax provision</p><p className="stat-figure mt-1 text-base font-bold text-ink-900">{money(data?.summary?.taxProvision)}</p></div>
        <div className="bg-surface px-5 py-3"><p className="eyebrow">Reporting window</p><p className="mt-1 text-sm font-semibold text-ink-900">{periodLabel}</p></div>
      </div>
      <div className="earnings-expense-table-wrap overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="sticky top-0 z-10 bg-surface"><tr className="border-b border-surface-line text-left text-[10px] uppercase tracking-[0.1em] text-slate-soft"><th className="px-5 py-3">Category</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
          <tbody>{expenseCount?data.expenses.map(row=><tr key={row.id} className="border-b border-surface-line/60 transition-colors hover:bg-surface-raised/35"><td className="px-5 py-3.5 font-semibold text-ink-900">{row.category}</td><td className="max-w-[360px] truncate px-4 py-3.5 text-slate-soft">{row.description||'—'}</td><td className="px-4 py-3.5 text-slate-soft">{dayjs(row.recorded_at).format('MMM D, YYYY')}</td><td className={`stat-figure px-4 py-3.5 text-right font-semibold ${row.amount<0?'text-teal-dim':'text-ink-900'}`}>{money(row.amount)}</td><td className="px-5 py-3.5 text-right"><button onClick={()=>setVoidTarget(row)} disabled={saving} className="rounded-lg border border-ember/20 px-2.5 py-1.5 text-[10px] font-semibold text-ember-dim transition-colors hover:bg-ember/10 disabled:opacity-40">Void</button></td></tr>):<tr><td colSpan="5"><Empty>No expenses for this period.</Empty></td></tr>}</tbody>
        </table>
      </div>
    </section>
    <ConfirmModal
      open={Boolean(voidTarget)}
      onClose={()=>!saving&&setVoidTarget(null)}
      onConfirm={voidExpense}
      busy={saving}
      eyebrow="Expense ledger"
      title="Void this expense?"
      message={voidTarget ? `Void ${voidTarget.category || 'this expense'} for ${money(voidTarget.amount)}? The original record remains auditable, but it will no longer count toward current expenses.` : ''}
      confirmLabel="Void expense"
      variant="danger"
    />
    <Modal open={modal==='fixed'} onClose={()=>!saving&&setModal(null)} busy={saving} onSubmit={saveFixed} eyebrow="Recurring provisions" title={`Fixed expenses · ${date.slice(0,7)}`} maxWidth="max-w-lg" footer={<><Button variant="ghost" onClick={()=>setModal(null)} disabled={saving}>Cancel</Button><Button variant="primary" onClick={saveFixed} disabled={saving||!Number.isFinite(Number(fixed.taxRatePercent))}>{saving?'Saving…':'Save & provision'}</Button></>}><div className="space-y-4"><p className="text-xs leading-5 text-slate-soft">The ISP provision is recorded once per effective month on its due date. The date range controls when recurrence applies; it never duplicates a month.</p><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-1.5 block">ISP monthly amount (₱)</span><input autoFocus value={fixed.ispMonthly} onChange={event=>setFixed({...fixed,ispMonthly:event.target.value})} inputMode="decimal" placeholder="0" className={inputClass}/></label><label className="block"><span className="eyebrow mb-1.5 block">Monthly due day</span><input value={fixed.dueDay} onChange={event=>setFixed({...fixed,dueDay:event.target.value})} inputMode="numeric" placeholder="1" className={inputClass}/></label><label className="block"><span className="eyebrow mb-1.5 block">Effective from</span><input type="date" value={fixed.effectiveFrom} onChange={event=>setFixed({...fixed,effectiveFrom:event.target.value})} className={inputClass}/></label><label className="block"><span className="eyebrow mb-1.5 block">Effective until (optional)</span><input type="date" value={fixed.effectiveUntil} onChange={event=>setFixed({...fixed,effectiveUntil:event.target.value})} className={inputClass}/></label></div><label className="block"><span className="eyebrow mb-1.5 block">Estimated tax rate (%)</span><input value={fixed.taxRatePercent} onChange={event=>setFixed({...fixed,taxRatePercent:event.target.value})} inputMode="decimal" placeholder="0" className={inputClass}/></label>{estimate&&<div className="rounded-lg bg-surface-raised p-3 text-xs"><div className="grid grid-cols-2 gap-2 text-slate-soft"><span>Gross YTD</span><b className="text-right text-ink-900">{money(estimate.grossYtd)}</b><span>Annual reduction</span><b className="text-right text-ink-900">{money(estimate.annualReduction)}</b><span>Taxable gross</span><b className="text-right text-ink-900">{money(estimate.taxableGross)}</b><span>Prior provisions</span><b className="text-right text-ink-900">{money(estimate.priorProvision)}</b><span>Current provision</span><b className="text-right text-ink-900">{money(estimate.proposedProvision)}</b></div>{estimate.regimeState==='manual_required'&&<label className="mt-3 flex gap-2 rounded-lg border border-ember/30 bg-ember/10 p-2 text-ember-dim"><input type="checkbox" checked={fixed.confirmManual} onChange={event=>setFixed({...fixed,confirmManual:event.target.checked})}/><span><TriangleAlert size={13} className="mr-1 inline"/>Gross exceeded ₱3 million. Confirm this as a custom estimate; it is not VAT or official tax due.</span></label>}</div>}<p className="text-[11px] text-slate-soft">Wallet receipts count in gross. Tax provision is an estimate only.</p></div></Modal>
    <Modal open={modal==='custom'} onClose={()=>!saving&&setModal(null)} busy={saving} onSubmit={saveCustom} eyebrow="Operating cost" title="Add custom expense" maxWidth="max-w-md" footer={<><Button variant="ghost" onClick={()=>setModal(null)} disabled={saving}>Cancel</Button><Button variant="primary" onClick={saveCustom} disabled={saving||!custom.category.trim()||!(Number(custom.amount)>0)}>Record expense</Button></>}><div className="space-y-3"><label className="block"><span className="eyebrow mb-1.5 block">Category</span><input autoFocus value={custom.category} onChange={event=>setCustom({...custom,category:event.target.value})} placeholder="Electricity, supplies…" className={inputClass}/></label><label className="block"><span className="eyebrow mb-1.5 block">Amount (₱)</span><input value={custom.amount} onChange={event=>setCustom({...custom,amount:event.target.value})} inputMode="decimal" placeholder="0" className={inputClass}/></label><label className="block"><span className="eyebrow mb-1.5 block">Note</span><input value={custom.description} onChange={event=>setCustom({...custom,description:event.target.value})} placeholder="Optional note" className={inputClass}/></label></div></Modal>
    <Modal open={modal==='email_summary'} onClose={()=>!sendingEmail&&setModal(null)} busy={sendingEmail} onSubmit={handleSendEmailSummary} eyebrow="Automated & On-Demand Delivery" title="Send Summary to Email (Brevo)" maxWidth="max-w-md" footer={<><Button variant="ghost" onClick={()=>setModal(null)} disabled={sendingEmail}>Cancel</Button><Button variant="primary" onClick={handleSendEmailSummary} disabled={sendingEmail} icon={Send}>{sendingEmail?'Delivering…':'Send Summary Email'}</Button></>}><div className="space-y-4"><p className="text-xs leading-5 text-slate-soft">Instantly compiles revenues from sessions, wallet top-ups, snack orders, and shift records into a branded performance report sent directly to your inbox via Brevo.</p><div><label className="block"><span className="eyebrow mb-1.5 block">Summary Window</span><div className="grid grid-cols-3 gap-2">{[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l])=><button type="button" key={v} onClick={()=>setEmailPeriod(v)} className={`rounded-lg py-1.5 text-xs font-semibold border transition ${emailPeriod===v?'bg-midnight text-soft-white border-gold/40':'border-surface-line text-slate-soft hover:text-ink-900'}`}>{l}</button>)}</div></label></div><label className="block"><span className="eyebrow mb-1.5 block">Recipient Email (Optional)</span><input type="email" value={emailRecipient} onChange={e=>setEmailRecipient(e.target.value)} placeholder="Leave blank to use default admin email" className={inputClass}/></label></div></Modal>
  </AdminPageWorkspace>
}

function Summary({label,value,strong=false}){return <div className={`overview-card p-4 ${strong?'border-teal/30 bg-teal/5':''}`}><p className="eyebrow">{label}</p><p className="stat-figure mt-2 text-xl font-bold text-ink-900">{money(value)}</p></div>}
function Empty({children}){return <div className="rounded-lg border border-dashed border-surface-line px-3 py-8 text-center text-xs text-slate-soft">{children}</div>}

