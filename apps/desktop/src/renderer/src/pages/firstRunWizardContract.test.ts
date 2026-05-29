import { describe, expect, it } from 'vitest'

import { assertFirstRunWizardOk } from './firstRunWizardContract'

describe('assertFirstRunWizardOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertFirstRunWizardOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit error code', () => {
    expect(() =>
      assertFirstRunWizardOk({ ok: false, error: '[STORE_KEY_DENIED] Key not allowed.' }),
    ).toThrow('[STORE_KEY_DENIED] Key not allowed.')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertFirstRunWizardOk({ ok: false }, 'Custom fallback')).toThrow(
      'Custom fallback',
    )
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertFirstRunWizardOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertFirstRunWizardOk({ error: 'x' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)',
    )
  })

  it('handles git config set-key response', () => {
    expect(() =>
      assertFirstRunWizardOk({
        ok: false,
        error: '[GIT_CONFIG_KEY_DENIED] Key not permitted.',
      }),
    ).toThrow('[GIT_CONFIG_KEY_DENIED] Key not permitted.')
  })

  it('handles null input', () => {
    expect(() => assertFirstRunWizardOk(null, 'Fallback')).toThrow(
      'Fallback (invalid response payload)',
    )
  })
})
