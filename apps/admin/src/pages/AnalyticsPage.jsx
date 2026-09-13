import { useEffect, useMemo, useState } from 'react'
import { Clock3, PhilippinePeso, Timer, UserRound, UsersRound } from 'lucide-react'
import { apiGet } from '../lib/api.js'
import { Line } from 'react-chartjs-2'
import { useAppData } from '../context/AppDataContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { formatAdminPeso } from '../lib/numeric.js'
import { CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'

ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,Tooltip,Legend,Filler)

const ranges=[['today','Today'],['7d','7 Days'],['30d','30 Days'],['year','This Year'],['all','All Time']]
function duration(seconds){const hours=Math.floor(Number(seconds||0)/3600);const minutes=Math.floor(Number(seconds||0)%3600/60);return `${hours}h ${minutes}m`}

export default function AnalyticsPage(){
  const { settings }=useAppData();const { isDark }=useTheme();const [range,setRange]=useState('30d');const [data,setData]=useState(null);const [error,setError]=useState('')
  useEffect(()=>{let active=true;setError('');apiGet(`/analytics?range=${range}&compare=1`).then(result=>active&&setData(result)).catch(err=>active&&setError(err.message));return()=>{active=false}},[range])
  const rows=useMemo(()=>{const byRevenue=new Map((data?.revenueSeries||[]).map(item=>[item.day,Number(item.revenue||0)]));return (data?.series||[]).map(item=>({...item,revenue:byRevenue.get(item.day)||0}))},[data]);const max=Math.max(1,...rows.map(row=>Number(row.visits||0)))
  const chartTextColor=isDark?'#C9B27A':'#423D42';const chartGridColor=isDark?'rgba(245,245,245,.08)':'rgba(32,41,55,.08)'
  const financeChart=useMemo(()=>{const days=[...new Set([...(data?.revenueSeries||[]).map(item=>item.day),...(data?.expenseSeries||[]).map(item=>item.day)])].sort();const revenue=new Map((data?.revenueSeries||[]).map(item=>[item.day,Number(item.revenue||0)])),expenses=new Map((data?.expenseSeries||[]).map(item=>[item.day,Number(item.expenses||0)]));return{labels:days.map(day=>day.slice(5)),datasets:[{label:'Revenue',data:days.map(day=>revenue.get(day)||0),borderColor:'#2fa879',backgroundColor:'rgba(47,168,121,.10)',fill:true,tension:.3},{label:'Expenses',data:days.map(day=>expenses.get(day)||0),borderColor:'#e85c62',backgroundColor:'rgba(232,92,98,.06)',tension:.3},{label:'Net',data:days.map(day=>(revenue.get(day)||0)-(expenses.get(day)||0)),borderColor:isDark?'#D4C1B9':'#766664',borderDash:[5,4],tension:.3}]}} ,[data,isDark])
  const financeChartOptions=useMemo(()=>({responsive:true,maintainAspectRatio:false,animation:{duration:140},interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:10,usePointStyle:true,color:chartTextColor}},tooltip:{backgroundColor:isDark?'#202937':'#F5F5F5',titleColor:isDark?'#F5F5F5':'#202937',bodyColor:chartTextColor,borderColor:isDark?'rgba(245,245,245,.14)':'rgba(169,152,152,.34)',borderWidth:1}},scales:{x:{grid:{display:false},ticks:{color:chartTextColor}},y:{beginAtZero:true,grid:{color:chartGridColor},ticks:{color:chartTextColor,callback:value=>`₱${value}`}}}}),[chartGridColor,chartTextColor,isDark])
  const visits=Number(data?.metrics?.visits||0),membersCount=Number(data?.metrics?.members||0),guestsCount=Number(data?.metrics?.guests||0)
  const memberShare=visits?Math.round(membersCount/visits*100):0
  const topRate=[...(data?.rateMix||[])].sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0]
  const analyticsRail = <>
    <AdminRailCard title="Key insights" subtitle="Highlights derived from the selected range.">
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">Visits</span><b className="stat-figure text-ink-900">{visits}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Average session</span><b className="stat-figure text-ink-900">{duration(data?.metrics?.averageSessionSeconds)}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Top rate</span><b className="max-w-[130px] truncate text-right text-ink-900">{topRate?.label||'No usage yet'}</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Traffic mix" subtitle="Members versus guest sessions.">
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">Members</span><b className="stat-figure text-ink-900">{membersCount}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Guests</span><b className="stat-figure text-ink-900">{guestsCount}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Member share</span><b className="stat-figure text-ink-900">{memberShare}%</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Range" subtitle="Analytics update when this range changes.">
      <div className="admin-segmented-control">{ranges.map(([key,label])=><button key={key} onClick={()=>setRange(key)} className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${range===key?'bg-midnight text-soft-white':'text-slate-soft hover:text-ink-900'}`}>{label}</button>)}</div>
    </AdminRailCard>
  </>

  return <AdminPageWorkspace aside={analyticsRail}><h1 className="sr-only">Analytics</h1>
    <div className="admin-page-toolbar mb-5 flex items-center justify-between"><div><p className="eyebrow">Performance range</p><p className="mt-1 text-xs text-slate-soft">Revenue, traffic, and rate-plan usage for the selected window.</p></div><div className="admin-segmented-control">{ranges.map(([key,label])=><button key={key} onClick={()=>setRange(key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${range===key?'bg-midnight text-soft-white':'text-slate-soft hover:text-ink-900'}`}>{label}</button>)}</div></div>{error&&<p className="mb-4 rounded-lg bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}
    <div className="admin-metric-grid"><AdminMetricCard icon={PhilippinePeso} label="Revenue" value={formatAdminPeso(data?.metrics?.revenue,settings)} tone="success" hint="Earned revenue in range"/><AdminMetricCard icon={UsersRound} label="Visits" value={visits} hint="Member + guest sessions"/><AdminMetricCard icon={UserRound} label="Members / Guests" value={`${membersCount} / ${guestsCount}`} hint="Traffic composition"/><AdminMetricCard icon={Timer} label="Average session" value={duration(data?.metrics?.averageSessionSeconds)} hint="Mean session duration"/></div>
    <section className="overview-card mt-4 p-5"><div className="mb-3"><h2 className="text-sm font-semibold text-ink-900">Revenue vs expenses</h2><p className="text-[11px] text-slate-soft">Earned revenue and recorded expenses in Philippine time.</p></div><div className="h-64">{financeChart.labels.length?<Line data={financeChart} options={financeChartOptions}/>:<p className="grid h-full place-items-center text-xs text-slate-soft">No financial activity in this range.</p>}</div></section>
    <div className="mt-4 grid gap-4 xl:grid-cols-2"><section className="overview-card p-5"><div className="mb-5"><h2 className="text-sm font-semibold text-ink-900">Customer traffic</h2><p className="mt-0.5 text-xs text-slate-soft">Daily member and guest sessions.</p></div>{rows.length?<div className="flex h-52 items-end gap-2 overflow-x-auto" role="img" aria-label="Daily customer traffic chart">{rows.map(row=><div key={row.day} className="flex h-full min-w-10 flex-1 flex-col justify-end"><div className="mb-1 text-center text-[9px] text-slate-soft">{row.visits}</div><div className="flex items-end gap-0.5" style={{height:`${Math.max(8,Number(row.visits)/max*85)}%`}}><div className="h-full flex-1 rounded-t bg-gold/75"/><div className="h-full flex-1 rounded-t bg-slate/50" style={{height:`${Math.max(8,Number(row.guests||0)/Math.max(1,Number(row.visits))*100)}%`}}/></div><span className="mt-2 truncate text-center text-[9px] text-slate-soft">{row.day.slice(5)}</span></div>)}</div>:<p className="rounded-lg border border-dashed border-surface-line py-16 text-center text-xs text-slate-soft">No sessions in this range.</p>}</section><section className="overview-card p-5"><h2 className="text-sm font-semibold text-ink-900">Rate-plan mix</h2><div className="mt-4 space-y-3">{(data?.rateMix||[]).length?data.rateMix.map(item=><div key={item.label}><div className="mb-1 flex justify-between text-xs"><span className="font-medium text-ink-900">{item.label}</span><span className="stat-figure text-slate-soft">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-raised"><div className="h-full rounded-full bg-teal" style={{width:`${Number(item.value)/Math.max(1,Number(data.metrics.visits))*100}%`}}/></div></div>):<p className="text-xs text-slate-soft">No rate usage yet.</p>}</div></section></div>
  </AdminPageWorkspace>
}
