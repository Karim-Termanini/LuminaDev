/** In-app runbook: each action runs a fixed whitelisted host probe (no clipboard). */
export const OPS_RUNBOOK = [
  { id: 'docker-df', label: 'Docker disk usage', labelKey: 'runbook.dockerDiskUsage', descKey: 'runbook.dockerDiskUsageDesc', probe: 'maintenance_docker_system_df', icon: 'database' },
  { id: 'docker-ps', label: 'Running containers', labelKey: 'runbook.runningContainers', descKey: 'runbook.runningContainersDesc', probe: 'maintenance_docker_ps_table', icon: 'list-tree' },
  { id: 'docker-journal', label: 'Docker service log', labelKey: 'runbook.dockerServiceLog', descKey: 'runbook.dockerServiceLogDesc', probe: 'maintenance_journalctl_docker', icon: 'output' },
  { id: 'cache-du', label: 'Largest cache folders', labelKey: 'runbook.largestCacheFolders', descKey: 'runbook.largestCacheFoldersDesc', probe: 'maintenance_du_cache_tail', icon: 'folder-opened' },
] as const

export type RunbookOp = (typeof OPS_RUNBOOK)[number]

export const MAINTENANCE_CRON_PRESETS = [
  { cron: '0 */6 * * *', labelKey: 'tasks.cronEvery6h', descKey: 'tasks.cronEvery6hDesc' },
  { cron: '0 3 * * *', labelKey: 'tasks.cronDaily3am', descKey: 'tasks.cronDaily3amDesc' },
  { cron: '30 2 * * 0', labelKey: 'tasks.cronWeekly', descKey: 'tasks.cronWeeklyDesc' },
] as const

export type MaintenanceHostProbe = (typeof OPS_RUNBOOK)[number]['probe']

/**
 * Maps transient status copy to alert styling. Avoid treating "Diagnostics completed with N issue(s)"
 * as success (older code matched the substring "completed").
 */
export function maintenanceStatusTone(message: string): 'success' | 'warning' {
  const m = message.toLowerCase()
  if (/\bissue\(s\)\./.test(m)) return 'warning'
  const successHints = [
    'diagnostics passed',
    'maintenance state saved.',
    'cleanup finished.',
    'support bundle exported',
    'recommended maintenance completed.',
  ]
  if (successHints.some((h) => m.includes(h))) return 'success'
  return 'warning'
}
