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
import { SystemPage } from './pages/SystemPage'
import { SshPage } from './pages/SshPage'
import { TerminalPage } from './pages/TerminalPage'
import { WorkstationPage } from './pages/WorkstationPage'
import { WizardFlow } from './wizard/WizardFlow'
import type { WizardStateStore } from '@linux-dev-home/shared'

export default function App(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    window.dh.storeGet({ key: 'wizard_state' }).then((state: unknown) => {
      const w = state as WizardStateStore | null
      if (!w?.completed || !!w?.showOnStartup) {
        setShowWizard(true)
      }
      setReady(true)
    })
  }, [])

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
        <Route path="/system" element={<SystemPage />} />
        <Route path="/workstation" element={<WorkstationPage />} />
        <Route path="/docker" element={<DockerPage />} />
        <Route path="/ssh" element={<SshPage />} />
        <Route path="/git-config" element={<GitConfigPage />} />
        <Route path="/registry" element={<RegistryPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/terminal" element={<TerminalPage />} />
      </Routes>
    </AppShell>
  )
}
