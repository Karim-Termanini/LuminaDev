import { describe, expect, it } from 'vitest'
import { humanizeSettingsError } from './settingsError'

describe('humanizeSettingsError', () => {
  it('maps SETTINGS_SAVE_FAILED to a user-friendly message', () => {
    expect(humanizeSettingsError('SETTINGS_SAVE_FAILED')).toBe(
      'Could not save settings. Check file permissions.'
    )
  })

  it('maps SETTINGS_LOAD_FAILED to a user-friendly message', () => {
    expect(humanizeSettingsError('SETTINGS_LOAD_FAILED')).toBe(
      'Could not load settings. Using defaults.'
    )
  })

  it('maps SETTINGS_INVALID_INPUT to a user-friendly message', () => {
    expect(humanizeSettingsError('SETTINGS_INVALID_INPUT')).toBe(
      'Invalid input. Please check the values and try again.'
    )
  })

  it('falls back to default for unknown error codes', () => {
    expect(humanizeSettingsError('UNKNOWN_CODE')).toBe('Settings operation failed.')
  })

  it('falls back to default for empty string', () => {
    expect(humanizeSettingsError('')).toBe('Settings operation failed.')
  })
})
