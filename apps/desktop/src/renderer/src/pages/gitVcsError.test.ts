import { describe, expect, it } from 'vitest'
import { humanizeGitVcsError, parseGitVcsErrorCode } from './gitVcsError'

describe('humanizeGitVcsError', () => {
  it('humanizes GIT_VCS_NOT_A_REPO', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_NOT_A_REPO] path /tmp'))).toContain(
      'not a Git repository',
    )
  })

  it('humanizes GIT_VCS_NO_STAGED when detail contains newlines (full git status)', () => {
    const raw = `[GIT_VCS_NO_STAGED] On branch main\n\nnothing to commit\n`
    const msg = humanizeGitVcsError(new Error(raw))
    expect(msg).toBe('Stage at least one file before committing.')
    expect(msg).not.toContain('[GIT_VCS_NO_STAGED]')
  })

  it('humanizes GIT_VCS_COMMIT_FAILED without implying not-a-repo', () => {
    const msg = humanizeGitVcsError(
      new Error('[GIT_VCS_COMMIT_FAILED] error: gpg failed to sign the data'),
    )
    expect(msg).toContain('Commit did not complete')
    expect(msg).not.toMatch(/not a Git repository/i)
  })

  it('humanizes GIT_VCS_PUSH_REJECTED', () => {
    const msg = humanizeGitVcsError(new Error('[GIT_VCS_PUSH_REJECTED] non-fast-forward'))
    expect(msg).toContain('non-fast-forward')
    expect(msg).toContain('Force push')
  })

  it('humanizes GIT_VCS_PROTECTED_BRANCH', () => {
    const msg = humanizeGitVcsError(new Error('[GIT_VCS_PROTECTED_BRANCH] remote: GH006'))
    expect(msg).toContain('protected')
    expect(msg).toContain('merge')
  })

  it('humanizes GIT_VCS_INTEGRATION_REQUIRED', () => {
    const msg = humanizeGitVcsError(
      new Error('[GIT_VCS_INTEGRATION_REQUIRED] Remote "origin" has 3 commit(s) not in your branch yet.'),
    )
    expect(msg).toContain('Integration required')
    expect(msg).toContain('behind the remote')
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

  it('humanizes GIT_VCS_MERGE_CONFLICT', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_MERGE_CONFLICT] CONFLICT'))).toContain('Abort merge')
  })

  it('humanizes GIT_VCS_STASH_POP_EMPTY', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_STASH_POP_EMPTY] No stash'))).toMatch(/stash entry/i)
  })

  it('humanizes GIT_VCS_MERGE_CONTINUE', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_MERGE_CONTINUE] no merge'))).toContain('Merge could not continue')
  })

  it('humanizes GIT_VCS_REBASE_CONTINUE', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_REBASE_CONTINUE] noop'))).toContain('Rebase could not continue')
  })

  it('humanizes GIT_VCS_REBASE_SKIP', () => {
    expect(humanizeGitVcsError(new Error('[GIT_VCS_REBASE_SKIP] no'))).toContain('Rebase skip')
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

  it('extracts GIT_VCS_INTEGRATION_REQUIRED', () => {
    expect(parseGitVcsErrorCode(new Error('[GIT_VCS_INTEGRATION_REQUIRED] behind'))).toBe(
      'GIT_VCS_INTEGRATION_REQUIRED',
    )
  })

  it('extracts GIT_VCS_PROTECTED_BRANCH', () => {
    expect(parseGitVcsErrorCode(new Error('[GIT_VCS_PROTECTED_BRANCH] remote'))).toBe(
      'GIT_VCS_PROTECTED_BRANCH',
    )
  })

  it('returns null for non-coded error', () => {
    expect(parseGitVcsErrorCode(new Error('plain error'))).toBeNull()
  })
})
