import { describe, it, expect } from 'vitest'
import { sshErrorString } from './sshError'

describe('sshErrorString', () => {
  it('handles auth failures', () => {
    expect(sshErrorString(new Error('Permission denied (publickey)'), 'fallback')).toMatch(/^\[SSH_AUTH_FAILED\]/)
  })

  it('handles host key verification failure', () => {
    expect(sshErrorString(new Error('Host key verification failed.'), 'fallback')).toMatch(/^\[SSH_HOST_KEY_FAIL\]/)
  })

  it('handles connection timeout', () => {
    expect(sshErrorString(new Error('Operation timed out'), 'fallback')).toMatch(/^\[SSH_TIMEOUT\]/)
  })

  it('handles connection refused', () => {
    expect(sshErrorString(new Error('Connection refused'), 'fallback')).toMatch(/^\[SSH_REFUSED\]/)
  })

  it('handles unknown errors with fallback', () => {
    expect(sshErrorString(new Error('Some weird error'), 'fallback')).toMatch(/^\[SSH_UNKNOWN\] Some weird error/)
    expect(sshErrorString({}, 'Global failure')).toMatch(/^\[SSH_UNKNOWN\] Global failure/)
  })
})
