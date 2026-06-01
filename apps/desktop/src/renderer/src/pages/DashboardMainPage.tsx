import type { ReactElement } from 'react'
import './DashboardPage.css'
import { ConfirmSwitchModal } from './dashboard/ConfirmSwitchModal'
import { CreateProjectModal } from './dashboard/CreateProjectModal'
import { DashboardMainView } from './dashboard/DashboardMainView'
import { DashboardToast } from './dashboard/DashboardToast'
import { ProfileSidebarPanel } from './dashboard/ProfileSidebarPanel'
import { useDashboardMainPage } from './dashboard/useDashboardMainPage'

/* eslint-disable react-refresh/only-export-components -- re-export profile switch helpers for tests */
export {
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
} from './profileSwitchProgress'

export function DashboardMainPage(): ReactElement {
  const vm = useDashboardMainPage()

  return (
    <div className="dashboard-split-layout">
      <DashboardToast vm={vm} />
      <DashboardMainView vm={vm} />
      <ProfileSidebarPanel vm={vm} />
      <ConfirmSwitchModal vm={vm} />
      <CreateProjectModal vm={vm} />
    </div>
  )
}
