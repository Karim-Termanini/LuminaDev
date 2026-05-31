import type { ContainerRow, HostMetrics, HostSecuritySnapshot, TopProcessRow } from '@linux-dev-home/shared'

import type { GuardianLayerId } from './maintenanceGuardian'

export type MaintenancePressureLevel = 'excellent' | 'healthy' | 'moderate' | 'critical'

export type MaintenanceOverallLevel = 'excellent' | 'healthy' | 'moderate' | 'critical' | 'unknown'

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function memUsedPct(metrics: HostMetrics): number {
  const raw = metrics.totalMemMb > 0
    ? Math.round(((metrics.totalMemMb - metrics.freeMemMb) / metrics.totalMemMb) * 100)
    : 0
  return clampPct(raw)
}

function diskUsedPct(metrics: HostMetrics): number {
  const raw = metrics.diskTotalGb > 0
    ? Math.round(((metrics.diskTotalGb - metrics.diskFreeGb) / metrics.diskTotalGb) * 100)
    : 0
  return clampPct(raw)
}

/** Display-only pressure score (0–100, higher = more pressure). Does not affect Guardian deductions. */
export function getGuardianLayerPressureScore(
  layerId: GuardianLayerId,
  metrics: HostMetrics | undefined,
  containers: ContainerRow[],
  topProcesses: TopProcessRow[],
  security: HostSecuritySnapshot | null,
): number | null {
  if (!metrics && layerId !== 'container_fleet' && layerId !== 'host_security') {
    return null
  }

  switch (layerId) {
    case 'host_compute':
      return metrics ? clampPct(metrics.cpuUsagePercent) : null
    case 'memory_pressure':
      return metrics ? memUsedPct(metrics) : null
    case 'storage_pressure':
      return metrics ? diskUsedPct(metrics) : null
    case 'container_fleet': {
      const total = containers.length
      if (total === 0) return 0
      const running = containers.filter((c) => c.state === 'running').length
      return clampPct(Math.round((1 - running / total) * 100))
    }
    case 'process_health': {
      if (topProcesses.length === 0) return 0
      const peakCpu = Math.max(...topProcesses.map((p) => p.cpuPercent))
      const peakMem = Math.max(...topProcesses.map((p) => p.memPercent))
      return clampPct(Math.max(peakCpu, peakMem))
    }
    case 'host_security': {
      if (!security) return null
      let score = 0
      if (security.firewall !== 'active') score += 50
      if (security.sshPasswordAuth === 'yes') score += 40
      return clampPct(score)
    }
    default:
      return null
  }
}

export function getMaintenancePressureLevel(
  score: number | null | undefined,
): MaintenancePressureLevel | null {
  if (score == null || !Number.isFinite(score)) return null
  const s = clampPct(score)
  if (s <= 30) return 'excellent'
  if (s <= 60) return 'healthy'
  if (s <= 80) return 'moderate'
  return 'critical'
}

export function getMaintenancePressureColor(level: MaintenancePressureLevel | null): string {
  if (level === 'excellent' || level === 'healthy') return 'var(--green)'
  if (level === 'moderate') return 'var(--orange)'
  if (level === 'critical') return '#ff5252'
  return 'var(--text-muted)'
}

export function getMaintenanceOverallLevel(
  guardianScore: number | null | undefined,
): MaintenanceOverallLevel {
  if (guardianScore == null || !Number.isFinite(guardianScore)) return 'unknown'
  const s = clampPct(guardianScore)
  if (s >= 90) return 'excellent'
  if (s >= 70) return 'healthy'
  if (s >= 50) return 'moderate'
  return 'critical'
}

export function getMaintenancePressureLabel(
  level: MaintenancePressureLevel | null,
  t: (key: string) => string,
): string | null {
  if (!level) return null
  return t(`layerPressure.${level}`)
}

export function getMaintenancePressureDescription(
  level: MaintenancePressureLevel | null,
  t: (key: string) => string,
): string | null {
  if (!level) return null
  return t(`layerPressure.${level}_desc`)
}

export function getGuardianLayerTooltip(
  layerId: GuardianLayerId,
  t: (key: string) => string,
): string {
  return t(`layerTooltip.${layerId}`)
}

export function getMaintenanceOverallLabel(
  level: MaintenanceOverallLevel,
  t: (key: string) => string,
): string {
  const keys: Record<MaintenanceOverallLevel, string> = {
    excellent: 'guardian.overallExcellent',
    healthy: 'guardian.overallHealthy',
    moderate: 'guardian.overallModerate',
    critical: 'guardian.overallCritical',
    unknown: 'guardian.overallUnknown',
  }
  return t(keys[level])
}
