import { describe, expect, it } from 'vitest'

import { humanizeSshError } from './sshError'

describe('humanizeSshError', () => {
  it('maps stable ssh codes to user-safe messages', () => {
    expect(humanizeSshError('[SSH_AUTH_FAILED] denied')).toContain('Authentication failed')
    expect(humanizeSshError('[SSH_TIMEOUT] timed out')).toContain('Connection timed out')
    expect(humanizeSshError('[SSH_NO_KEY] missing')).toContain('No SSH key found')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeSshError('plain runtime message')).toBe('plain runtime message')
  })
})
