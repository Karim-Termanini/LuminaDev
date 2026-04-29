import { describe, expect, it } from 'vitest'

import { assertSshOk } from './sshContract'

describe('assertSshOk', () => {
  it('accepts success payload', () => {
    expect(() => assertSshOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit ssh error', () => {
    expect(() => assertSshOk({ ok: false, error: '[SSH_AUTH_FAILED] denied' })).toThrow(
      '[SSH_AUTH_FAILED] denied'
    )
  })

  it('throws on invalid payload', () => {
    expect(() => assertSshOk('bad', 'Custom fallback')).toThrow('Custom fallback (invalid response payload)')
  })
})
