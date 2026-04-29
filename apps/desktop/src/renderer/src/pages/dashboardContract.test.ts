import { describe, expect, it } from 'vitest'

import { assertDashboardLayoutGet } from './dashboardContract'

describe('assertDashboardLayoutGet', () => {
  it('returns layout for success payload', () => {
    const layout = { version: 1, placements: [] }
    expect(assertDashboardLayoutGet({ ok: true, layout })).toEqual(layout)
  })

  it('throws on error payload', () => {
    expect(() => assertDashboardLayoutGet({ ok: false, error: 'boom' })).toThrow('boom')
  })

  it('throws on malformed payload', () => {
    expect(() => assertDashboardLayoutGet('bad')).toThrow('invalid response payload')
  })
})
