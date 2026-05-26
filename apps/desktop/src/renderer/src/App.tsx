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
import { syncAppearanceFromStore } from './theme/applyAccent'

export default function App(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [showReadinessWizard, setShowReadinessWizard] = useState(false)

  useEffect(() => {
    window.dh.storeGet({ key: 'readiness_wizard_complete' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      const completed = bag.ok ? bag.data === true : false
      if (!completed) {
        setShowReadinessWizard(true)
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready || showReadinessWizard) return
    void syncAppearanceFromStore()
  }, [ready, showReadinessWizard])

  if (!ready) return null
  if (showReadinessWizard) {
    return (
      <ReadinessWizardPage
        onComplete={() => {
          setShowReadinessWizard(false)
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
        {/* Legacy redirects */}
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
