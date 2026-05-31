import { describe, expect, it } from 'vitest'

import type { ContainerRow, HostMetrics, HostSecuritySnapshot } from '@linux-dev-home/shared'

import {
  getGuardianLayerPressureScore,
  getMaintenanceOverallLevel,
  getMaintenancePressureDescription,
  getMaintenancePressureLevel,
} from './maintenanceHealth'

function baseMetrics(over: Partial<HostMetrics> = {}): HostMetrics {
  return {
    cpuUsagePercent: 45,
    cpuModel: 'test',
    loadAvg: [0.1, 0.2, 0.3],
    totalMemMb: 8000,
    freeMemMb: 5120,
    swapTotalMb: 0,
    swapFreeMb: 0,
    uptimeSec: 100,
    diskTotalGb: 100,
    diskFreeGb: 58,
    diskReadMbps: 0,
    diskWriteMbps: 0,
    netRxMbps: 0,
    netTxMbps: 0,
    ...over,
  }
}

function row(state: string): ContainerRow {
  return { id: 'x', name: 'n', image: 'i', state, status: state, ports: '' }
}

const secOk: HostSecuritySnapshot = {
  firewall: 'active',
  selinux: '',
  sshPermitRootLogin: 'no',
  sshPasswordAuth: 'no',
  failedAuth24h: 0,
  riskyOpenPorts: [],
}

describe('maintenanceHealth', () => {
  it('classifies pressure thresholds', () => {
    expect(getMaintenancePressureLevel(20)).toBe('excellent')
    expect(getMaintenancePressureLevel(45)).toBe('healthy')
    expect(getMaintenancePressureLevel(75)).toBe('moderate')
    expect(getMaintenancePressureLevel(92)).toBe('critical')
  })

  it('derives layer pressure from metrics without changing guardian math', () => {
    const m = baseMetrics()
    expect(getGuardianLayerPressureScore('host_compute', m, [], [], null)).toBe(45)
    expect(getGuardianLayerPressureScore('memory_pressure', m, [], [], null)).toBe(36)
    expect(getGuardianLayerPressureScore('storage_pressure', m, [], [], null)).toBe(42)
  })

  it('derives container fleet pressure from stopped ratio', () => {
    const score = getGuardianLayerPressureScore(
      'container_fleet',
      baseMetrics(),
      [row('running'), row('exited'), row('exited'), row('exited'), row('exited')],
      [],
      secOk,
    )
    expect(score).toBe(80)
    expect(getMaintenancePressureLevel(score)).toBe('moderate')
  })

  it('maps guardian headline score to overall level', () => {
    expect(getMaintenanceOverallLevel(100)).toBe('excellent')
    expect(getMaintenanceOverallLevel(75)).toBe('healthy')
    expect(getMaintenanceOverallLevel(55)).toBe('moderate')
    expect(getMaintenanceOverallLevel(40)).toBe('critical')
    expect(getMaintenanceOverallLevel(null)).toBe('unknown')
  })

  it('returns localized description keys', () => {
    const t = (key: string) => key
    expect(getMaintenancePressureDescription('healthy', t)).toBe('layerPressure.healthy_desc')
  })
})
