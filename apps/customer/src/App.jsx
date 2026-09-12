import { Routes, Route } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import CustomerLoginForm from './components/auth/CustomerLoginForm.jsx'
import CustomerPasswordSetupModal from './components/auth/CustomerPasswordSetupModal.jsx'
import CustomerSessionView from './pages/CustomerSessionView.jsx'
import ToastContainer from './components/common/ToastContainer.jsx'
import EmergencyControlGuard from './components/common/EmergencyControlGuard.jsx'
import PowerCommandWarning from './components/common/PowerCommandWarning.jsx'
import StationLockedOverlay from './components/common/StationLockedOverlay.jsx'

export default function App() {
  const { user, authLoading } = useAuth()

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="panel px-6 py-5">Checking this PC…</div></div>
  }

  if (!user) {
    return <>
      <CustomerLoginForm />
      <StationLockedOverlay />
      <EmergencyControlGuard />
      <PowerCommandWarning />
      <ToastContainer />
    </>
  }

  return <>
    <Routes><Route path="*" element={<CustomerSessionView />} /></Routes>
    <CustomerPasswordSetupModal />
    <StationLockedOverlay />
    <EmergencyControlGuard />
    <PowerCommandWarning />
    <ToastContainer />
  </>
}
