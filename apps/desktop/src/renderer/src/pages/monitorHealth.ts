export type MonitorHealthLevel = 'good' | 'warn' | 'critical'

export type MonitorHealthMetric = 'cpu' | 'ram' | 'disk'

const THRESHOLDS: Record<
  MonitorHealthMetric,
  { goodMax: number; warnMax: number }
> = {
  cpu: { goodMax: 69.99, warnMax: 90 },
  ram: { goodMax: 79.99, warnMax: 90 },
  disk: { goodMax: 84.99, warnMax: 95 },
}

export function getMonitorHealthLevel(
  metric: MonitorHealthMetric,
  value: number | null | undefined,
): MonitorHealthLevel | null {
  if (value == null || !Number.isFinite(value)) return null
  const { goodMax, warnMax } = THRESHOLDS[metric]
  if (value <= goodMax) return 'good'
  if (value <= warnMax) return 'warn'
  return 'critical'
}

export function getMonitorHealthColor(level: MonitorHealthLevel | null): string {
  if (level === 'good') return 'var(--green)'
  if (level === 'warn') return 'var(--orange)'
  if (level === 'critical') return '#ff5252'
  return 'var(--text-muted)'
}

export function getMonitorHealthDescription(
  metric: MonitorHealthMetric,
  value: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  const level = getMonitorHealthLevel(metric, value)
  if (!level) return null
  if (metric === 'cpu') {
    if (level === 'good') return t('health.cpu.good')
    if (level === 'warn') return t('health.cpu.warn')
    return t('health.cpu.critical')
  }
  if (metric === 'ram') {
    if (level === 'good') return t('health.ram.good')
    if (level === 'warn') return t('health.ram.warn')
    return t('health.ram.critical')
  }
  if (level === 'good') return t('health.disk.good')
  if (level === 'warn') return t('health.disk.warn')
  return t('health.disk.critical')
}
