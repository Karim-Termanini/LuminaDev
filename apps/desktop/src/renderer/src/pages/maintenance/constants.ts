import { ComposeProfileSchema } from '@linux-dev-home/shared'

export const STATUS_AUTO_DISMISS_MS = 12_000
export const profileIds = ComposeProfileSchema.options
export const TABS = [
  'Overview / Health Dashboard',
  'System Cleanup',
  'Data & Profiles',
  'Logs & History',
  'Scheduled / Automation',
] as const

export const DEFAULT_DOCKER_CLEANUP_SELECTION = {
  containers: true,
  images: true,
  volumes: false,
  networks: false,
} as const

export const MAINT_TAB_META: Record<
  (typeof TABS)[number],
  { icon: string; short: string }
> = {
  'Overview / Health Dashboard': { icon: 'dashboard', short: 'Overview' },
  'System Cleanup': { icon: 'trash', short: 'Cleanup' },
  'Data & Profiles': { icon: 'folder', short: 'Data' },
  'Logs & History': { icon: 'history', short: 'Logs' },
  'Scheduled / Automation': { icon: 'watch', short: 'Schedule' },
}

export const OVERVIEW_NAV: Array<{
  tab: (typeof TABS)[number]
  icon: string
  titleKey: string
  descKey: string
}> = [
  { tab: 'System Cleanup', icon: 'trash', titleKey: 'overview.nav.cleanup', descKey: 'overview.nav.cleanupDesc' },
  { tab: 'Data & Profiles', icon: 'folder', titleKey: 'overview.nav.data', descKey: 'overview.nav.dataDesc' },
  { tab: 'Logs & History', icon: 'history', titleKey: 'overview.nav.logs', descKey: 'overview.nav.logsDesc' },
  { tab: 'Scheduled / Automation', icon: 'watch', titleKey: 'overview.nav.schedule', descKey: 'overview.nav.scheduleDesc' },
]

export const GUARDIAN_LAYER_LABELS: Record<string, string> = {
  host_compute: 'guardian.hostCompute',
  memory_pressure: 'guardian.memoryPressure',
  storage_pressure: 'guardian.storagePressure',
  container_fleet: 'guardian.containerFleet',
  process_health: 'guardian.processHealth',
  host_security: 'guardian.hostSecurity',
}

export const GUARDIAN_LAYER_META: Record<string, { icon: string; tone: string }> = {
  host_compute: { icon: 'pulse', tone: 'compute' },
  memory_pressure: { icon: 'chip', tone: 'memory' },
  storage_pressure: { icon: 'save', tone: 'storage' },
  container_fleet: { icon: 'package', tone: 'docker' },
  process_health: { icon: 'server-process', tone: 'process' },
  host_security: { icon: 'shield', tone: 'security' },
}
