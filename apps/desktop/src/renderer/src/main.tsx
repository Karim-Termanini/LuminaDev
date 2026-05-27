import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './App'
import { ensureDesktopApi } from './api/desktopApiBridge'
import { I18nProvider } from './i18n/I18nContext'
import { NotificationProvider } from './layout/NotificationProvider'
import './theme/global.css'
import './theme/rtl.css'
import './i18n/i18n'

ensureDesktopApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </I18nProvider>
    </HashRouter>
  </React.StrictMode>
)
