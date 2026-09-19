import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppDataProvider } from './context/AppDataContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AdminModeProvider } from './context/AdminModeContext.jsx'
import { EsportsThemeProvider } from './context/EsportsThemeContext.jsx'
import { SkinProvider } from './context/SkinContext.jsx'
import App from './App.jsx'
import { cloudConsumeAuthCallback } from './lib/cloudClient.js'
import './index.css'
import { registerAdminPwa } from './lib/pwa.js'

// Migrate any legacy hash URL (e.g. /#/clients) to clean HTML5 URL (/clients)
if (typeof window !== 'undefined' && window.location.hash && window.location.hash.startsWith('#/')) {
  const cleanPath = window.location.hash.slice(1)
  window.history.replaceState(null, '', cleanPath)
}

cloudConsumeAuthCallback()
registerAdminPwa()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminModeProvider>
          <EsportsThemeProvider>
            <SkinProvider>
              <ThemeProvider><AppDataProvider><App /></AppDataProvider></ThemeProvider>
            </SkinProvider>
          </EsportsThemeProvider>
        </AdminModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
