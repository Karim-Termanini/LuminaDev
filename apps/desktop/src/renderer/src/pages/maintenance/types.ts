import type { SystemdServiceId, SystemdServiceState } from '../maintenanceSystemdServices'
import type { TABS } from './constants'

export type TabId = (typeof TABS)[number]
export type ServiceState = Record<SystemdServiceId, SystemdServiceState>
export type DiagnosticCheck = { id: string; label: string; ok: boolean; details: string }
