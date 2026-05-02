import { describe, expect, it } from 'vitest'
import { assertGitVcsOk } from './gitVcsContract'

describe('assertGitVcsOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertGitVcsOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit VCS error', () => {
    expect(() =>
      assertGitVcsOk({ ok: false, error: '[GIT_VCS_PUSH_REJECTED] non-fast-forward' }),
    ).toThrow('[GIT_VCS_PUSH_REJECTED]')
  })

  it('throws with fallback when error missing', () => {
    expect(() => assertGitVcsOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when payload not an object', () => {
    expect(() => assertGitVcsOk('bad', 'Custom')).toThrow('Custom (invalid response payload)')
  })

  it('throws when ok flag missing', () => {
    expect(() => assertGitVcsOk({ error: 'x' }, 'Custom')).toThrow('Custom (missing ok flag)')
  })
})
