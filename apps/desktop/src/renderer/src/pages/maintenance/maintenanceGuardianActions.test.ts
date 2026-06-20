import { describe, expect, it } from 'vitest'
import {
  buildMonitorLayerPath,
  getGuardianLayerActionLabelKey,
  resolveGuardianLayerTarget,
} from './maintenanceGuardianActions'

describe('resolveGuardianLayerTarget', () => {
  it('routes compute and memory layers to monitor overview focus', () => {
    expect(resolveGuardianLayerTarget('host_compute', 'healthy')).toEqual({
      kind: 'monitor',
      tab: 'overview',
      focus: 'cpu',
    })
    expect(resolveGuardianLayerTarget('memory_pressure', 'critical')).toEqual({
      kind: 'monitor',
      tab: 'overview',
      focus: 'memory',
    })
  })

  it('opens cleanup when storage is stressed, otherwise monitor disk', () => {
    expect(resolveGuardianLayerTarget('storage_pressure', 'moderate')).toEqual({
      kind: 'maintenanceTab',
      tab: 'System Cleanup',
    })
    expect(resolveGuardianLayerTarget('storage_pressure', 'healthy')).toEqual({
      kind: 'monitor',
      tab: 'disk',
    })
  })

  it('routes fleet and process layers to docker and processes', () => {
    expect(resolveGuardianLayerTarget('container_fleet', null)).toEqual({ kind: 'route', path: '/docker' })
    expect(resolveGuardianLayerTarget('process_health', 'excellent')).toEqual({
      kind: 'monitor',
      tab: 'processes',
    })
  })

  it('routes security to monitor security focus', () => {
    expect(resolveGuardianLayerTarget('host_security', 'critical')).toEqual({
      kind: 'monitor',
      tab: 'overview',
      focus: 'security',
    })
  })
})

describe('getGuardianLayerActionLabelKey', () => {
  it('uses stressed suffix for moderate and critical levels', () => {
    expect(getGuardianLayerActionLabelKey('host_compute', 'moderate')).toBe('layerAction.host_compute_stressed')
    expect(getGuardianLayerActionLabelKey('host_compute', 'healthy')).toBe('layerAction.host_compute')
  })
})

describe('buildMonitorLayerPath', () => {
  it('includes tab and focus query params', () => {
    expect(
      buildMonitorLayerPath({ kind: 'monitor', tab: 'overview', focus: 'cpu' })
    ).toBe('/dashboard/monitor?tab=overview&focus=cpu')
  })
})
