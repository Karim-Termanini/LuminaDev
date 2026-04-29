import { describe, expect, it } from 'vitest'

import { assertMonitorOk } from './monitorContract'

describe('assertMonitorOk', () => {
  it('returns payload for success result', () => {
    expect(assertMonitorOk({ ok: true, info: { os: 'linux' } }, 'info')).toEqual({ os: 'linux' })
  })

  it('throws when operation failed', () => {
    expect(() => assertMonitorOk({ ok: false, error: 'boom' }, 'info')).toThrow('boom')
  })

  it('throws on malformed payload', () => {
    expect(() => assertMonitorOk('bad', 'info', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)'
    )
  })
})
