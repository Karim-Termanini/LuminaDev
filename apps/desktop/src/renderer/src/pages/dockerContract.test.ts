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

  it('accepts valid container stats response', () => {
    expect(() =>
      assertDockerOk({
        ok: true,
        cpuPct: 2.5,
        memMb: 10,
        memLimitMb: 1989.63,
        netRxMb: 0.0012,
        netTxMb: 5.3,
      })
    ).not.toThrow()
  })

  it('throws for failed container stats', () => {
    expect(() =>
      assertDockerOk({ ok: false, error: '[DOCKER_STATS_FAILED] no such container' })
    ).toThrow('[DOCKER_STATS_FAILED] no such container')
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertDockerOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)'
    )
  })
})
