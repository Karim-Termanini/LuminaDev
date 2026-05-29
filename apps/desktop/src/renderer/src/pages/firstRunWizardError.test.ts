import { describe, expect, it } from 'vitest'
import { humanizeFirstRunWizardError } from './firstRunWizardError'

describe('humanizeFirstRunWizardError', () => {
  it('maps store key denied to user-safe message', () => {
    expect(
      humanizeFirstRunWizardError('[STORE_KEY_DENIED] Key not allowed.'),
    ).toContain('store key was rejected')
  })

  it('maps git config key denied to user-safe message', () => {
    expect(
      humanizeFirstRunWizardError('[GIT_CONFIG_KEY_DENIED] Key not permitted.'),
    ).toContain('not permitted')
  })

  it('maps git config set failed to user-safe message', () => {
    expect(
      humanizeFirstRunWizardError('[GIT_CONFIG_SET_FAILED] command failed'),
    ).toContain('Git configuration failed')
  })

  it('falls back to raw detail for unknown codes', () => {
    expect(humanizeFirstRunWizardError('[UNKNOWN_CODE] some detail')).toBe('some detail')
  })

  it('falls back to raw text when no code bracket', () => {
    expect(humanizeFirstRunWizardError('plain runtime message')).toBe('plain runtime message')
  })

  it('handles Error object input', () => {
    expect(humanizeFirstRunWizardError(new Error('[STORE_KEY_DENIED] rejected'))).toContain(
      'store key was rejected',
    )
  })

  it('returns fallback for empty input', () => {
    expect(humanizeFirstRunWizardError('')).toBe('Wizard operation failed.')
  })
})
