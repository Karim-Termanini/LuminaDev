import { describe, expect, it } from 'vitest'
import { buildSecurityRemediations } from './securityRemediation'

const base = {
  firewall: 'active' as const,
  selinux: '',
  sshPermitRootLogin: 'no',
  sshPasswordAuth: 'no',
  sshHostKeyPresent: false,
  failedAuth24h: 0,
  riskyOpenPorts: [] as number[],
}

describe('buildSecurityRemediations', () => {
  it('returns no items when security is null', () => {
    expect(buildSecurityRemediations(null)).toEqual([])
  })

  it('includes firewall fix when inactive', () => {
    const items = buildSecurityRemediations({
      ...base,
      firewall: 'inactive',
    })
    expect(items.some((i) => i.id === 'firewall')).toBe(true)
  })

  it('includes ssh key step when password auth on and no host key', () => {
    const items = buildSecurityRemediations({
      ...base,
      sshPasswordAuth: 'yes',
      sshHostKeyPresent: false,
    })
    expect(items.map((i) => i.id)).toEqual(['ssh-keys', 'ssh-password-off'])
    expect(items.find((i) => i.id === 'ssh-password-off')?.kind).toBe('hostExec')
  })

  it('skips ssh key step when host key already present', () => {
    const items = buildSecurityRemediations({
      ...base,
      sshPasswordAuth: 'yes',
      sshHostKeyPresent: true,
    })
    expect(items.map((i) => i.id)).toEqual(['ssh-password-off'])
    expect(items[0]?.step).toBe(1)
  })

  it('includes ssh and port fixes for risky snapshot', () => {
    const items = buildSecurityRemediations({
      ...base,
      sshPermitRootLogin: 'yes',
      sshPasswordAuth: 'yes',
      sshHostKeyPresent: false,
      riskyOpenPorts: [22, 5432],
    })
    expect(items.map((i) => i.id)).toEqual(['ssh-keys', 'ssh-password-off', 'ssh-root-off', 'risky-ports'])
  })
})
