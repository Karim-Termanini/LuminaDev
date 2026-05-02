import { describe, expect, it } from 'vitest'
import { assertCloudAuthOk } from './cloudAuthContract'

describe('assertCloudAuthOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertCloudAuthOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit cloud auth error', () => {
    expect(() =>
      assertCloudAuthOk({ ok: false, error: '[CLOUD_AUTH_INVALID_TOKEN] bad token' }),
    ).toThrow('[CLOUD_AUTH_INVALID_TOKEN] bad token')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertCloudAuthOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertCloudAuthOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertCloudAuthOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)',
    )
  })
})
