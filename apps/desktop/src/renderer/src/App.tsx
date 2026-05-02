import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { AppShell } from './layout/AppShell'
import { DashboardKernelsPage } from './pages/DashboardKernelsPage'
import { DashboardLayout } from './pages/DashboardLayout'
import { DashboardLogsPage } from './pages/DashboardLogsPage'
import { DashboardMainPage } from './pages/DashboardMainPage'
import { DashboardWidgetsPage } from './pages/DashboardWidgetsPage'
import { DockerPage } from './pages/DockerPage'
import { GitConfigPage } from './pages/GitConfigPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { RegistryPage } from './pages/RegistryPage'
import { MonitorPage } from './pages/MonitorPage'
import { SshPage } from './pages/SshPage'
import { TerminalPage } from './pages/TerminalPage'
import { RuntimesPage } from './pages/RuntimesPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { SettingsPage } from './pages/SettingsPage'
import { WizardFlow } from './wizard/WizardFlow'
import { parseAppearance, WizardStateStoreSchema } from '@linux-dev-home/shared'
import { applyAppearanceAccent } from './theme/applyAccent'

export default function App(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'wizard_state' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      const w = bag.ok ? WizardStateStoreSchema.safeParse(bag.data).data : undefined
      if (!w?.completed || !!w?.showOnStartup) {
        setShowWizard(true)
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready || showWizard) return
    void window.dh.storeGet({ key: 'appearance' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      if (!bag.ok) return
      applyAppearanceAccent(parseAppearance(bag.data).accent)
    })
  }, [ready, showWizard])

  if (!ready) return null
  if (showWizard) return <WizardFlow onComplete={() => setShowWizard(false)} />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardMainPage />} />
          <Route path="widgets" element={<DashboardWidgetsPage />} />
          <Route path="kernels" element={<DashboardKernelsPage />} />
          <Route path="logs" element={<DashboardLogsPage />} />
        </Route>
        <Route path="/system" element={<MonitorPage />} />
        <Route path="/docker" element={<DockerPage />} />
        <Route path="/ssh" element={<SshPage />} />
        <Route path="/git-config" element={<GitConfigPage />} />
        <Route path="/registry" element={<RegistryPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/runtimes" element={<RuntimesPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  )
}
