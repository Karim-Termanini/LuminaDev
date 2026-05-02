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
    expect(humanizeGitVcsError(new Error('[GIT_VCS_AUTH_FAILED] 403'))).toContain('Cloud Git')
  })

  it('humanizes GIT_VCS_DIFF_TOO_LARGE', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_DIFF_TOO_LARGE]'))).toContain('too large')
  })

  it('humanizes GIT_VCS_NETWORK', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_NETWORK] timeout'))).toContain(
      'Network error',
    )
  })

  it('humanizes GIT_VCS_CHECKOUT_DIRTY without implying not-a-repo', () => {
    const msg = humanizeGitVcsError(
      new Error(
        '[GIT_VCS_CHECKOUT_DIRTY] error: Your local changes to the following files would be overwritten by checkout:',
      ),
    )
    expect(msg).toContain('dialog')
    expect(msg).not.toMatch(/not a Git repository/i)
  })

  it('humanizes GIT_VCS_CHECKOUT', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_CHECKOUT] fatal: invalid reference'))).toContain('Checkout failed')
  })

  it('humanizes GIT_VCS_STASH_EMPTY', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_STASH_EMPTY] No local changes to save'))).toContain('Nothing to stash')
  })

  it('humanizes GIT_VCS_STASH', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_STASH] cannot save'))).toContain('Stash failed')
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
