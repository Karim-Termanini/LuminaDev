import type { GuardianLayerId } from '../maintenanceGuardian'
import type { MaintenancePressureLevel } from '../maintenanceHealth'
import type { TabId } from './types'

export type GuardianLayerNavigateTarget =
  | { kind: 'monitor'; tab: 'overview' | 'processes' | 'docker' | 'disk' | 'network'; focus?: string }
  | { kind: 'route'; path: string }
  | { kind: 'maintenanceTab'; tab: TabId }

function isStressed(level: MaintenancePressureLevel | null): boolean {
  return level === 'moderate' || level === 'critical'
}

export function resolveGuardianLayerTarget(
  layerId: GuardianLayerId,
  pressureLevel: MaintenancePressureLevel | null
): GuardianLayerNavigateTarget {
  switch (layerId) {
    case 'host_compute':
      return { kind: 'monitor', tab: 'overview', focus: 'cpu' }
    case 'memory_pressure':
      return { kind: 'monitor', tab: 'overview', focus: 'memory' }
    case 'storage_pressure':
      if (isStressed(pressureLevel)) {
        return { kind: 'maintenanceTab', tab: 'System Cleanup' }
      }
      return { kind: 'monitor', tab: 'disk' }
    case 'container_fleet':
      return { kind: 'route', path: '/docker' }
    case 'process_health':
      return { kind: 'monitor', tab: 'processes' }
    case 'host_security':
      return { kind: 'monitor', tab: 'overview', focus: 'security' }
  }
}

export function getGuardianLayerActionLabelKey(
  layerId: GuardianLayerId,
  pressureLevel: MaintenancePressureLevel | null
): string {
  return isStressed(pressureLevel) ? `layerAction.${layerId}_stressed` : `layerAction.${layerId}`
}

export function buildMonitorLayerPath(target: Extract<GuardianLayerNavigateTarget, { kind: 'monitor' }>): string {
  const params = new URLSearchParams()
  params.set('tab', target.tab)
  if (target.focus) params.set('focus', target.focus)
  return `/dashboard/monitor?${params.toString()}`
}
