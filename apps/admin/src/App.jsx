import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AdminLoginForm from './components/auth/AdminLoginForm.jsx'
import AdminCredentialSetup from './components/auth/AdminCredentialSetup.jsx'
import MainLayout from './components/layout/MainLayout.jsx'
import ToastContainer from './components/common/ToastContainer.jsx'
import FloorMatrix from './pages/FloorMatrix.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import TariffsPage from './pages/TariffsPage.jsx'
import MembersPage from './pages/MembersPage.jsx'
import EarningsPage from './pages/EarningsPage.jsx'
import LogsPage from './pages/LogsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import DeveloperConsolePage from './pages/DeveloperConsolePage.jsx'
import CloudInviteSetup from './components/cloud/CloudInviteSetup.jsx'
import CloudAccessPending from './components/cloud/CloudAccessPending.jsx'

export default function App() {
  const { user, authLoading, mustChange } = useAuth()
  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><div className="panel px-6 py-5">Checking admin session…</div></div>
  if (!user) return <><AdminLoginForm /><ToastContainer /></>
  if (user.cloud && user.cloudInviteSetup) return <><CloudInviteSetup /><ToastContainer /></>
  if (user.cloud && user.cloudBusinessSuspended) return <><CloudAccessPending suspended /><ToastContainer /></>
  if (user.cloud && user.cloudDeveloper && user.cloudNeedsSetup) return <><DeveloperConsolePage standalone /><ToastContainer /></>
  if (user.cloud && user.cloudNeedsSetup) return <><CloudAccessPending /><ToastContainer /></>
  return <>
    {mustChange && <AdminCredentialSetup />}
    <MainLayout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/clients" element={<FloorMatrix />} />
        <Route path="/tariffs" element={<TariffsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/expenses" element={<EarningsPage />} />
        <Route path="/expense" element={<EarningsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/developer" element={user.cloudDeveloper?<DeveloperConsolePage />:<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
    <ToastContainer />
  </>
}
