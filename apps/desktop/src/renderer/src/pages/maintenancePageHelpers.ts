/** In-app runbook: each action runs a fixed whitelisted host probe (no clipboard). */
export const OPS_RUNBOOK = [
  { id: 'docker-df', label: 'Docker disk usage', probe: 'maintenance_docker_system_df', icon: 'database' },
  { id: 'docker-ps', label: 'Running containers', probe: 'maintenance_docker_ps_table', icon: 'list-tree' },
  { id: 'docker-journal', label: 'Docker service log', probe: 'maintenance_journalctl_docker', icon: 'output' },
  { id: 'cache-du', label: 'Largest cache folders', probe: 'maintenance_du_cache_tail', icon: 'folder-opened' },
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
