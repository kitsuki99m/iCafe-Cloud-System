import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppDataProvider } from './context/AppDataContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AdminModeProvider } from './context/AdminModeContext.jsx'
import App from './App.jsx'
import { cloudConsumeAuthCallback } from './lib/cloudClient.js'
import './index.css'
import { registerAdminPwa } from './lib/pwa.js'

cloudConsumeAuthCallback()
registerAdminPwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <AdminModeProvider>
          <ThemeProvider><AppDataProvider><App /></AppDataProvider></ThemeProvider>
        </AdminModeProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
