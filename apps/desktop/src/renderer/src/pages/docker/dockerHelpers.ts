import type { ContainerInspectData } from '@linux-dev-home/shared'

export function truncateMiddle(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input
  const side = Math.max(8, Math.floor((maxLen - 1) / 2))
  return `${input.slice(0, side)}…${input.slice(-side)}`
}

export function parsePortMappings(
  text: string
): Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const out: Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }> = []
  for (const line of lines) {
    const [pair, protoRaw] = line.split('/')
    const [hostRaw, containerRaw] = pair.split(':')
    const hostPort = Number(hostRaw)
    const containerPort = Number(containerRaw)
    if (!Number.isInteger(hostPort) || !Number.isInteger(containerPort)) {
      throw new Error(`Invalid port mapping: ${line}. Use host:container, e.g. 8080:80`)
    }
    const protocol = protoRaw === 'udp' ? 'udp' : 'tcp'
    out.push({ hostPort, containerPort, protocol })
  }
  return out
}

export function parseVolumeMappings(
  text: string
): Array<{ hostPath: string; containerPath: string }> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const idx = line.indexOf(':')
    if (idx <= 0 || idx >= line.length - 1) {
      throw new Error(`Invalid volume mapping: ${line}. Use /host/path:/container/path`)
    }
    return { hostPath: line.slice(0, idx), containerPath: line.slice(idx + 1) }
  })
}

export function getNetworkDescription(name: string, t: (key: string) => string): string {
  if (name === 'bridge') return t('network.descBridge')
  if (name === 'host') return t('network.descHost')
  if (name === 'none') return t('network.descNone')
  if (name.endsWith('_default')) return t('network.descCompose')
  return t('network.descCustom')
}

export function getVolumeDescription(
  name: string,
  isUsed: boolean,
  t: (key: string) => string
): string {
  if (name.length === 64 && !name.includes('_')) {
    return isUsed ? t('volume.descAnonymousUsed') : t('volume.descAnonymous')
  }
  return t('volume.descNamed')
}

export function parseEnvLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export function extractFirstHostPort(ports: string): string {
  const m = ports.match(/:(\d+)->/)
  return m?.[1] ?? ''
}

export function portsFromRowDisplay(
  ports: string
): Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }> {
  if (!ports || ports === '—') return []
  return ports
    .split(',')
    .map((p) => {
      const m = p.trim().match(/(?:[\d.]+:)?(\d+)->(\d+)\/(tcp|udp)/)
      if (!m) return null
      return { hostPort: m[1], containerPort: m[2], protocol: m[3] as 'tcp' | 'udp' }
    })
    .filter(Boolean) as Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }>
}

export function hydrateDrawerFromInspect(data: ContainerInspectData): {
  editPorts: Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }>
  editEnv: string[]
  editNetwork: string
  editRestart: string
} {
  return {
    editPorts: data.ports.map((p) => ({
      hostPort: String(p.hostPort),
      containerPort: String(p.containerPort),
      protocol: (p.protocol === 'udp' ? 'udp' : 'tcp') as 'tcp' | 'udp',
    })),
    editEnv: [...data.env],
    editNetwork: data.networks[0] ?? 'bridge',
    editRestart: data.restartPolicy || 'no',
  }
}
