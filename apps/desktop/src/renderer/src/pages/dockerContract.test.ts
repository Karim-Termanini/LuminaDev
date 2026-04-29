import { describe, expect, it } from 'vitest'

import { assertDockerOk } from './dockerContract'

describe('assertDockerOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertDockerOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit docker error', () => {
    expect(() => assertDockerOk({ ok: false, error: '[DOCKER_UNAVAILABLE] daemon down' })).toThrow(
      '[DOCKER_UNAVAILABLE] daemon down'
    )
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertDockerOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertDockerOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)'
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertDockerOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)'
    )
  })
})
