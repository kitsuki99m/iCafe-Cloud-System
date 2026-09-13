import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppDataProvider } from './context/AppDataContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import App from './App.jsx'
import { cloudConsumeAuthCallback } from './lib/cloudClient.js'
import './index.css'

cloudConsumeAuthCallback()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ThemeProvider><AppDataProvider><App /></AppDataProvider></ThemeProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
