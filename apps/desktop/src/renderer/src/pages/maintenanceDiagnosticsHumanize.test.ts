import { describe, expect, it } from 'vitest'

import { humanizeMaintenanceDiagnostic } from './maintenanceDiagnosticsHumanize'

const t = (key: string) => key

describe('humanizeMaintenanceDiagnostic', () => {
  it('humanizes failed security with ssh password auth', () => {
    const h = humanizeMaintenanceDiagnostic(
      {
        id: 'security',
        label: 'Security baseline',
        ok: false,
        details: 'firewall=active, sshPasswordAuth=yes',
      },
      t,
    )
    expect(h.summary).toBe('diag.security.fail.summary')
    expect(h.hint).toBe('diag.security.fail.hintSshPassword')
    expect(h.action?.href).toBe('/settings?tab=system')
  })

  it('humanizes docker success', () => {
    const h = humanizeMaintenanceDiagnostic(
      {
        id: 'docker',
        label: 'Docker',
        ok: true,
        details: 'docker=true compose=true buildx=true',
      },
      t,
    )
    expect(h.summary).toBe('diag.docker.pass.summary')
  })

  it('humanizes a11y failure with counts', () => {
    const h = humanizeMaintenanceDiagnostic(
      {
        id: 'a11y',
        label: 'A11y',
        ok: false,
        details: 'focusable=59, landmarks=11, unlabeledInputs=1, unlabeledButtons=0, imagesMissingAlt=0',
      },
      t,
    )
    expect(h.hint).toBe('diag.a11y.fail.hint')
  })
})
