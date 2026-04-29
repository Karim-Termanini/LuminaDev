import { describe, expect, it } from 'vitest'

import { humanizeGitError } from './gitError'

describe('humanizeGitError', () => {
  it('maps stable git codes to user-safe messages', () => {
    expect(humanizeGitError('[GIT_PERMISSION_DENIED] permission denied')).toContain('Git permission denied')
    expect(humanizeGitError('[GIT_NOT_FOUND] not a git repository')).toContain('not found')
    expect(humanizeGitError('[GIT_NETWORK] could not resolve host')).toContain('network error')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeGitError('plain runtime message')).toBe('plain runtime message')
  })
})
