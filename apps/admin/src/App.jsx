import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AdminSplashScreen from './components/common/AdminSplashScreen.jsx'
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
import MenuManagementPage from './pages/MenuManagementPage.jsx'
import VouchersPage from './pages/VouchersPage.jsx'
import LauncherManagementPage from './pages/LauncherManagementPage.jsx'
import DeveloperConsolePage from './pages/DeveloperConsolePage.jsx'
import CloudInviteSetup from './components/cloud/CloudInviteSetup.jsx'
import CloudAccessPending from './components/cloud/CloudAccessPending.jsx'
import AdminTitleBar from './components/layout/AdminTitleBar.jsx'

export default function App() {
  const { user, authLoading, mustChange } = useAuth()
  if (authLoading) return <><AdminTitleBar /><AdminSplashScreen label="Checking admin session…" /></>
  if (!user) return <><AdminTitleBar /><AdminLoginForm /><ToastContainer /></>
  if (user.cloud && user.cloudInviteSetup) return <><AdminTitleBar /><CloudInviteSetup /><ToastContainer /></>
  if (user.cloud && user.cloudBusinessSuspended) return <><AdminTitleBar /><CloudAccessPending suspended /><ToastContainer /></>
  if (user.cloud && user.cloudDeveloper && user.cloudNeedsSetup) return <><AdminTitleBar /><DeveloperConsolePage standalone /><ToastContainer /></>
  const isStaffOrCashier = user?.role === 'cashier' || user?.role === 'staff' || user?.cloudRole === 'cashier' || user?.cloudRole === 'staff' || user?.cloudRole === 'viewer'
  return <>
    <AdminTitleBar />
    {mustChange && <AdminCredentialSetup />}
    <MainLayout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/clients" element={<FloorMatrix />} />
        <Route path="/launcher" element={<LauncherManagementPage />} />
        <Route path="/menu" element={<MenuManagementPage />} />
        <Route path="/tariffs" element={isStaffOrCashier ? <Navigate to="/" replace /> : <TariffsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/vouchers" element={<TariffsPage initialTab="vouchers" />} />
        <Route path="/earnings" element={isStaffOrCashier ? <Navigate to="/" replace /> : <EarningsPage />} />
        <Route path="/expenses" element={isStaffOrCashier ? <Navigate to="/" replace /> : <EarningsPage />} />
        <Route path="/expense" element={isStaffOrCashier ? <Navigate to="/" replace /> : <EarningsPage />} />
        <Route path="/analytics" element={isStaffOrCashier ? <Navigate to="/" replace /> : <AnalyticsPage />} />
        <Route path="/logs" element={isStaffOrCashier ? <Navigate to="/" replace /> : <LogsPage />} />
        <Route path="/settings" element={isStaffOrCashier ? <Navigate to="/" replace /> : <SettingsPage />} />
        <Route path="/developer" element={user.cloudDeveloper && !isStaffOrCashier ? <DeveloperConsolePage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
    <ToastContainer />
  </>
}
