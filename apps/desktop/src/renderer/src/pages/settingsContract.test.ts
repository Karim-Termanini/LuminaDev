import { describe, expect, it } from 'vitest'

import { assertSettingsOk } from './settingsContract'

describe('assertSettingsOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertSettingsOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit settings error', () => {
    expect(() =>
      assertSettingsOk({ ok: false, error: '[SETTINGS_SAVE_FAILED] disk full' })
    ).toThrow('[SETTINGS_SAVE_FAILED] disk full')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertSettingsOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertSettingsOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)'
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertSettingsOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)'
    )
  })

  it('passes through data payloads', () => {
    expect(() =>
      assertSettingsOk({ ok: true, data: { theme: 'dark' } })
    ).not.toThrow()
  })
})
