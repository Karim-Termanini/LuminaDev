export type SystemdServiceId = 'ssh' | 'nginx' | 'ufw'

export type SystemdServiceState = 'active' | 'inactive' | 'unknown' | 'not_installed'

export type SystemdServiceDef = {
  id: SystemdServiceId
  probeUnits: string[]
  startUnits: string[]
  titleKey: string
  descKey: string
  icon: string
  /** When true, missing unit files show "Not installed" instead of Start. */
  optional: boolean
}

export const MAINTENANCE_SYSTEMD_SERVICES: SystemdServiceDef[] = [
  {
    id: 'ssh',
    probeUnits: ['sshd', 'ssh'],
    startUnits: ['sshd', 'ssh'],
    titleKey: 'systemd.ssh.title',
    descKey: 'systemd.ssh.desc',
    icon: 'terminal',
    optional: false,
  },
  {
    id: 'nginx',
    probeUnits: ['nginx'],
    startUnits: ['nginx'],
    titleKey: 'systemd.nginx.title',
    descKey: 'systemd.nginx.desc',
    icon: 'globe',
    optional: true,
  },
  {
    id: 'ufw',
    probeUnits: ['ufw'],
    startUnits: ['ufw'],
    titleKey: 'systemd.ufw.title',
    descKey: 'systemd.ufw.desc',
    icon: 'shield',
    optional: true,
  },
]

export function normalizeSystemdState(raw: string | undefined): SystemdServiceState {
  const s = (raw ?? '').trim().toLowerCase()
  if (s.includes('active') && !s.includes('inactive')) return 'active'
  if (s.includes('inactive') || s.includes('failed')) return 'inactive'
  return 'unknown'
}

export function isUnitNotFoundError(message: string): boolean {
  return /unit .+ was not found|unit .+ not found|could not be found/i.test(message)
}
