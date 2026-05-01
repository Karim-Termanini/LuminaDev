import { describe, expect, it } from 'vitest'

import type { ContainerRow, HostMetrics, HostSecuritySnapshot } from '@linux-dev-home/shared'

import { evaluateGuardian } from './maintenanceGuardian'

function baseMetrics(over: Partial<HostMetrics> = {}): HostMetrics {
  return {
    cpuUsagePercent: 20,
    cpuModel: 'test',
    loadAvg: [0.1, 0.2, 0.3],
    totalMemMb: 8000,
    freeMemMb: 4000,
    swapTotalMb: 0,
    swapFreeMb: 0,
    uptimeSec: 100,
    diskTotalGb: 100,
    diskFreeGb: 50,
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

describe('evaluateGuardian', () => {
  it('returns null score until metrics exist', () => {
    const g = evaluateGuardian(undefined, null, [])
    expect(g.score).toBeNull()
    expect(g.layers).toHaveLength(5)
  })

  it('returns 100 when all layers healthy', () => {
    const g = evaluateGuardian(
      baseMetrics(),
      { firewall: 'active', selinux: '', sshPermitRootLogin: 'no', sshPasswordAuth: 'no', failedAuth24h: 0, riskyOpenPorts: [] },
      [row('running'), row('running')]
    )
    expect(g.score).toBe(100)
    expect(g.layers.every((l) => l.ok)).toBe(true)
    expect(g.layers.every((l) => l.deduction === 0)).toBe(true)
  })

  it('deducts for high CPU', () => {
    const g = evaluateGuardian(baseMetrics({ cpuUsagePercent: 90 }), null, [])
    expect(g.score).toBe(82)
    const cpu = g.layers.find((l) => l.id === 'host_compute')
    expect(cpu?.deduction).toBe(18)
    expect(cpu?.ok).toBe(false)
  })

  it('deducts for low running ratio when fleet exists', () => {
    const g = evaluateGuardian(
      baseMetrics(),
      { firewall: 'active', selinux: '', sshPermitRootLogin: 'no', sshPasswordAuth: 'no', failedAuth24h: 0, riskyOpenPorts: [] },
      [row('running'), row('exited'), row('exited'), row('exited'), row('exited')]
    )
    expect(g.layers.find((l) => l.id === 'container_fleet')?.deduction).toBe(8)
    expect(g.score).toBe(92)
  })

  it('combines firewall and ssh deductions', () => {
    const sec: HostSecuritySnapshot = {
      firewall: 'inactive',
      selinux: '',
      sshPermitRootLogin: 'no',
      sshPasswordAuth: 'yes',
      failedAuth24h: 0,
      riskyOpenPorts: [],
    }
    const g = evaluateGuardian(baseMetrics(), sec, [])
    expect(g.layers.find((l) => l.id === 'host_security')?.deduction).toBe(25)
    expect(g.score).toBe(75)
  })
})
