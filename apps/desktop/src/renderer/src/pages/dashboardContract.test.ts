import { describe, expect, it } from 'vitest'

import { assertDashboardOk } from './dashboardContract'

describe('assertDashboardOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertDashboardOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit error', () => {
    expect(() => assertDashboardOk({ ok: false, error: '[DOCKER_UNAVAILABLE] daemon down' })).toThrow(
      '[DOCKER_UNAVAILABLE] daemon down'
    )
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertDashboardOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertDashboardOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)'
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertDashboardOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)'
    )
  })
})
