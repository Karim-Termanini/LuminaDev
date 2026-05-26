import { describe, expect, it } from 'vitest'
import { humanizeProfileError } from './profileError'

describe('humanizeProfileError', () => {
  it('humanizes PROFILE_SWITCH_INVALID', () => {
    expect(humanizeProfileError('[PROFILE_SWITCH_INVALID] bad profile')).toContain(
      'Invalid profile switch',
    )
    expect(humanizeProfileError('[PROFILE_SWITCH_INVALID] bad profile')).toContain('bad profile')
  })

  it('humanizes PROFILE_SWITCH_FAILED', () => {
    const msg = humanizeProfileError('[PROFILE_SWITCH_FAILED] compose up failed')
    expect(msg).toContain('Could not switch profiles')
  })

  it('humanizes DOCKER_UNAVAILABLE', () => {
    const msg = humanizeProfileError('[DOCKER_UNAVAILABLE] daemon not reachable')
    expect(msg).toContain('Docker is not running')
  })

  it('humanizes PROFILE_CRED_INVALID', () => {
    expect(humanizeProfileError('[PROFILE_CRED_INVALID] missing value')).toContain('ID and value')
  })

  it('humanizes PROFILE_CRED_STORE_READ', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_READ] read error')).toContain(
      'Could not read credentials',
    )
  })

  it('humanizes PROFILE_CRED_STORE_DECRYPT', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_DECRYPT] decrypt error')).toContain(
      'Could not decrypt credentials',
    )
  })

  it('humanizes PROFILE_CRED_STORE_PARSE', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_PARSE] bad format')).toContain(
      'Could not parse credentials',
    )
  })

  it('humanizes PROFILE_CRED_STORE_ENCODE', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_ENCODE] encode error')).toContain(
      'Could not encode credential',
    )
  })

  it('humanizes PROFILE_CRED_STORE_ENCRYPT', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_ENCRYPT] encrypt error')).toContain(
      'Could not encrypt credential',
    )
  })

  it('humanizes PROFILE_CRED_STORE_DIR', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_DIR] mkdir error')).toContain(
      'Could not create credential storage directory',
    )
  })

  it('humanizes PROFILE_CRED_STORE_WRITE', () => {
    expect(humanizeProfileError('[PROFILE_CRED_STORE_WRITE] write error')).toContain(
      'Could not write credentials to storage',
    )
  })

  it('appends detail when present', () => {
    const msg = humanizeProfileError('[DOCKER_UNAVAILABLE] (socket not found)')
    expect(msg).toContain('Docker is not running')
    expect(msg).toContain('socket not found')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeProfileError('plain error')).toBe('plain error')
  })

  it('falls back to default when raw is empty', () => {
    expect(humanizeProfileError('')).toBe('Profile operation failed.')
  })
})
