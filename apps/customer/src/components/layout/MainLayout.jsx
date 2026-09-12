import { NavLink } from 'react-router-dom'
import { Monitor, Tags, Users, ScrollText, Settings, Wifi, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import AdminNotificationCenter from '../admin/AdminNotificationCenter.jsx'
import logo from '../../assets/aktura-logo.svg'

const NAV = [
  { to: '/', label: 'Floor Matrix', icon: Monitor, end: true },
  { to: '/tariffs', label: 'Tariffs', icon: Tags },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function MainLayout({ children }) {
  const { user, logout } = useAuth()
  const { serverError } = useAppData()

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <aside className="sticky top-0 z-[120] flex h-screen w-60 shrink-0 flex-col overflow-visible border-r border-surface-line bg-surface/60 px-3 py-4">
        <div className="flex items-center gap-2.5 px-2 pb-6 pt-2">
          <img src={logo} alt="" className="h-7 w-7" />
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-ink-900">
              Aezakmi Cafe
            </p>
            <p className="text-[11px] leading-tight text-slate-soft">Davao Branch</p>
          </div>
        </div>

        <nav className="min-h-0 flex flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-surface-raised/60 px-3 py-2.5">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-led rounded-full ${serverError ? "bg-ember" : "bg-teal"}`} />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-medium text-ink-900">{serverError ? 'Server Offline' : 'Server Online'}</p>
            <p className="flex items-center gap-1 text-[11px] text-slate-soft">
              <Wifi size={11} /> {serverError ? 'Check local network' : 'Local network synced'}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg px-2 py-2">
          <div className="leading-tight">
            <p className="text-xs font-medium text-ink-900">{user?.name}</p>
            <p className="text-[11px] text-slate-soft">Signed in as Admin</p>
          </div>
          <div className="flex items-center gap-0.5">
            <AdminNotificationCenter />
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  )
}
