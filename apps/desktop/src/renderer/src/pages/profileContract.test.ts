import { describe, expect, it } from 'vitest'
import { assertProfileSwitchOk, assertProfileCredentialOk } from './profileContract'

describe('assertProfileSwitchOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertProfileSwitchOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit profile error', () => {
    expect(() =>
      assertProfileSwitchOk({ ok: false, error: '[DOCKER_UNAVAILABLE] daemon down' }),
    ).toThrow('[DOCKER_UNAVAILABLE] daemon down')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertProfileSwitchOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertProfileSwitchOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertProfileSwitchOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)',
    )
  })
})

describe('assertProfileCredentialOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertProfileCredentialOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit credential error', () => {
    expect(() =>
      assertProfileCredentialOk({ ok: false, error: '[PROFILE_CRED_INVALID] missing id' }),
    ).toThrow('[PROFILE_CRED_INVALID] missing id')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertProfileCredentialOk({ ok: false }, 'Cred failed')).toThrow('Cred failed')
  })

  it('throws when response is not an object', () => {
    expect(() => assertProfileCredentialOk(null, 'Cred failed')).toThrow(
      'Cred failed (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertProfileCredentialOk({ ids: [] }, 'Cred failed')).toThrow(
      'Cred failed (missing ok flag)',
    )
  })
})
