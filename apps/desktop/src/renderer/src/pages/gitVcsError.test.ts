import { describe, expect, it } from 'vitest'
import { humanizeGitVcsError, parseGitVcsErrorCode } from './gitVcsError'

describe('humanizeGitVcsError', () => {
  it('humanizes GIT_VCS_NOT_A_REPO', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_NOT_A_REPO] path /tmp'))).toContain(
      'not a Git repository',
    )
  })

  it('humanizes GIT_VCS_PUSH_REJECTED', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_PUSH_REJECTED] non-fast-forward'))).toContain(
      'Pull the latest changes',
    )
  })

  it('humanizes GIT_VCS_AUTH_FAILED', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_AUTH_FAILED] 403'))).toContain(
      'No credentials',
    )
  })

  it('humanizes GIT_VCS_DIFF_TOO_LARGE', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_DIFF_TOO_LARGE]'))).toContain('too large')
  })

  it('humanizes GIT_VCS_NETWORK', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_NETWORK] timeout'))).toContain(
      'Network error',
    )
  })

  it('returns raw detail for unknown codes', () => {
    expect(humanizeGitVcsError(new Error('Something weird'))).toBe('Something weird')
  })
})

describe('parseGitVcsErrorCode', () => {
  it('extracts code from bracketed error', () => {
    expect(parseGitVcsErrorCode(new Error('[GIT_VCS_AUTH_FAILED] detail'))).toBe(
      'GIT_VCS_AUTH_FAILED',
    )
  })

  it('returns null for non-coded error', () => {
    expect(parseGitVcsErrorCode(new Error('plain error'))).toBeNull()
  })
})
