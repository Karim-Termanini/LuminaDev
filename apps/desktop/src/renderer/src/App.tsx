import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { AppShell } from './layout/AppShell'
import { DashboardKernelsPage } from './pages/DashboardKernelsPage'
import { DashboardLayout } from './pages/DashboardLayout'
import { DashboardLogsPage } from './pages/DashboardLogsPage'
import { DashboardMainPage } from './pages/DashboardMainPage'
import { DockerPage } from './pages/DockerPage'
import { DeveloperGitPage } from './pages/DeveloperGitPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { MonitorPage } from './pages/MonitorPage'
import { SshPage } from './pages/SshPage'
import { TerminalPage } from './pages/TerminalPage'
import { RuntimesPage } from './pages/RuntimesPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { SettingsPage } from './pages/SettingsPage'
import { SystemReadinessPage } from './pages/SystemReadinessPage'
import { ReadinessWizardPage } from './pages/ReadinessWizardPage'
import { FirstRunWizardPage } from './pages/FirstRunWizardPage'
import { syncAppearanceFromStore } from './theme/applyAccent'
import { useNotification } from './layout/NotificationProvider'
import { initProfileSwitchProgress } from './pages/profileSwitchProgress'
import { resumeBackgroundProjectSetupIfNeeded } from './pages/projectBackgroundSetup'
import { SETUP_WIZARD_OPEN_EVENT } from './lib/setupWizard'

export default function App(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [showReadinessWizard, setShowReadinessWizard] = useState(false)
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false)
  const { showToast } = useNotification()

  useEffect(() => {
    initProfileSwitchProgress()
    void resumeBackgroundProjectSetupIfNeeded((message, type) => {
      showToast(type === 'error' ? 'error' : 'success', message)
    })
  }, [showToast])

  useEffect(() => {
    window.dh.storeGet({ key: 'readiness_wizard_complete' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      const completed = bag.ok ? bag.data === true : false
      if (!completed) {
        setShowReadinessWizard(true)
        setReady(true)
        return
      }
      window.dh.storeGet({ key: 'first_run_wizard_complete' }).then((res2: unknown) => {
        const bag2 = res2 as { ok?: boolean; data?: unknown }
        if (!bag2.ok || bag2.data !== true) {
          setShowFirstRunWizard(true)
        }
        setReady(true)
      })
    })
  }, [])

  useEffect(() => {
    const onOpenSetupWizard = (): void => {
      setShowFirstRunWizard(true)
    }
    window.addEventListener(SETUP_WIZARD_OPEN_EVENT, onOpenSetupWizard)
    return () => window.removeEventListener(SETUP_WIZARD_OPEN_EVENT, onOpenSetupWizard)
  }, [])

  useEffect(() => {
    if (!ready || showReadinessWizard || showFirstRunWizard) return
    void syncAppearanceFromStore()
  }, [ready, showReadinessWizard, showFirstRunWizard])

  useEffect(() => {
    void window.dh.storeGet({ key: 'update_settings' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      if (bag.ok && bag.data && typeof bag.data === 'object') {
        const updateSettings = bag.data as { checkOnStartup?: boolean }
        if (updateSettings.checkOnStartup) {
          void window.dh.appUpdateCheck().then((updateRes) => {
            if (updateRes.ok && updateRes.updateAvailable) {
              showToast(
                'info',
                `A new update is available: ${updateRes.latestVersion}. Go to Settings → Update to get it.`
              )
            }
          })
        }
      }
    })
  }, [showToast])

  if (!ready) return null
  if (showReadinessWizard) {
    return (
      <ReadinessWizardPage
        onComplete={() => {
          setShowReadinessWizard(false)
          setShowFirstRunWizard(true)
        }}
      />
    )
  }
  if (showFirstRunWizard) {
    return (
      <FirstRunWizardPage
        onComplete={() => {
          setShowFirstRunWizard(false)
          void syncAppearanceFromStore()
        }}
      />
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardMainPage />} />
          <Route path="kernels" element={<DashboardKernelsPage />} />
          <Route path="logs" element={<DashboardLogsPage />} />
        </Route>
        <Route path="/system" element={<MonitorPage />} />
        <Route path="/docker" element={<DockerPage />} />
        <Route path="/ssh" element={<SshPage />} />
        <Route path="/git" element={<DeveloperGitPage />} />
        <Route path="/git-config" element={<Navigate to="/git?tab=config" replace />} />
        <Route path="/git-vcs" element={<Navigate to="/git?tab=vcs" replace />} />
        <Route path="/cloud-git" element={<Navigate to="/git?tab=cloud" replace />} />
        <Route path="/registry" element={<Navigate to="/git?tab=vcs" replace />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/runtimes" element={<RuntimesPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/system-readiness" element={<SystemReadinessPage />} />
      </Routes>
    </AppShell>
  )
}
