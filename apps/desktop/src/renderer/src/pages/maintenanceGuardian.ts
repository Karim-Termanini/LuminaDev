import type { ContainerRow, HostMetrics, HostSecuritySnapshot } from '@linux-dev-home/shared'

/**
 * Phase 7 — Maintenance “Guardian” contract (codified).
 *
 * Each layer maps to observable signals from `dh:metrics`, Docker list, and
 * `dh:monitor:security`. The headline score is 100 minus the sum of layer
 * deductions (clamped to 0..100). This module is the single source of truth
 * for that math so the UI cannot drift from the documented behavior.
 */
export type GuardianLayerId =
  | 'host_compute'
  | 'memory_pressure'
  | 'storage_pressure'
  | 'container_fleet'
  | 'host_security'

export type GuardianLayer = {
  id: GuardianLayerId
  title: string
  /** What signal(s) this layer uses — operator-facing, matches IPC names. */
  signals: string
  ok: boolean
  detail: string
  deduction: number
}

export type GuardianEvaluation = {
  /** `null` until host metrics are available (avoid fake “100% healthy”). */
  score: number | null
  layers: GuardianLayer[]
}

const CPU_WARN = 85
const MEM_WARN_PCT = 90
const DISK_WARN_PCT = 92
const FLEET_MIN_RUNNING_RATIO = 0.3

export function evaluateGuardian(
  metrics: HostMetrics | undefined,
  security: HostSecuritySnapshot | null,
  containers: ContainerRow[]
): GuardianEvaluation {
  if (!metrics) {
    return {
      score: null,
      layers: [
        {
          id: 'host_compute',
          title: 'Host compute',
          signals: 'dh:metrics → cpuUsagePercent',
          ok: true,
          detail: 'Waiting for metrics…',
          deduction: 0,
        },
        {
          id: 'memory_pressure',
          title: 'Memory pressure',
          signals: 'dh:metrics → totalMemMb / freeMemMb',
          ok: true,
          detail: 'Waiting for metrics…',
          deduction: 0,
        },
        {
          id: 'storage_pressure',
          title: 'Storage pressure',
          signals: 'dh:metrics → diskTotalGb / diskFreeGb',
          ok: true,
          detail: 'Waiting for metrics…',
          deduction: 0,
        },
        {
          id: 'container_fleet',
          title: 'Container fleet',
          signals: 'dh:docker:list → running / total',
          ok: true,
          detail: `${containers.filter((c) => c.state === 'running').length}/${containers.length} running (metrics pending)`,
          deduction: 0,
        },
        {
          id: 'host_security',
          title: 'Host security posture',
          signals: 'dh:monitor:security → firewall, sshPasswordAuth',
          ok: true,
          detail: security ? `firewall=${security.firewall}, sshPasswordAuth=${security.sshPasswordAuth}` : 'Waiting for security snapshot…',
          deduction: 0,
        },
      ],
    }
  }

  const m = metrics
  const memPct = m.totalMemMb > 0 ? Math.round(((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100) : 0
  const diskPct = m.diskTotalGb > 0 ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : 0
  const running = containers.filter((c) => c.state === 'running').length
  const total = containers.length
  const ratio = total > 0 ? running / total : 1

  const cpuDed = m.cpuUsagePercent > CPU_WARN ? 18 : 0
  const memDed = memPct > MEM_WARN_PCT ? 22 : 0
  const diskDed = diskPct > DISK_WARN_PCT ? 20 : 0
  let fleetDed = 0
  if (total > 0 && ratio < FLEET_MIN_RUNNING_RATIO) fleetDed = 8

  let fwDed = 0
  let sshDed = 0
  if (security) {
    if (security.firewall !== 'active') fwDed = 15
    if (security.sshPasswordAuth === 'yes') sshDed = 10
  }
  const secDed = fwDed + sshDed

  const layers: GuardianLayer[] = [
    {
      id: 'host_compute',
      title: 'Host compute',
      signals: 'dh:metrics.cpuUsagePercent',
      ok: m.cpuUsagePercent <= CPU_WARN,
      detail: `CPU ${m.cpuUsagePercent.toFixed(1)}% (warn >${CPU_WARN}%)`,
      deduction: cpuDed,
    },
    {
      id: 'memory_pressure',
      title: 'Memory pressure',
      signals: 'dh:metrics memory used %',
      ok: memPct <= MEM_WARN_PCT,
      detail: `RAM used ~${memPct}% (warn >${MEM_WARN_PCT}%)`,
      deduction: memDed,
    },
    {
      id: 'storage_pressure',
      title: 'Storage pressure',
      signals: 'dh:metrics disk used %',
      ok: diskPct <= DISK_WARN_PCT,
      detail: `Disk used ~${diskPct}% (warn >${DISK_WARN_PCT}%)`,
      deduction: diskDed,
    },
    {
      id: 'container_fleet',
      title: 'Container fleet',
      signals: 'dh:docker:list',
      ok: total === 0 || ratio >= FLEET_MIN_RUNNING_RATIO,
      detail: total === 0 ? 'No containers reported.' : `${running}/${total} running (warn if <${Math.round(FLEET_MIN_RUNNING_RATIO * 100)}% running)`,
      deduction: fleetDed,
    },
    {
      id: 'host_security',
      title: 'Host security posture',
      signals: 'dh:monitor:security',
      ok: secDed === 0,
      detail: security
        ? `firewall=${security.firewall}, sshPasswordAuth=${security.sshPasswordAuth}${fwDed ? ` (−${fwDed} inactive firewall)` : ''}${sshDed ? ` (−${sshDed} password SSH)` : ''}`
        : 'Security snapshot unavailable.',
      deduction: secDed,
    },
  ]

  const raw = 100 - layers.reduce((s, l) => s + l.deduction, 0)
  const score = Math.max(0, Math.min(100, raw))
  return { score, layers }
}
