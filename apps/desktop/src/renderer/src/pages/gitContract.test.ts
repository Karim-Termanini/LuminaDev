import { describe, expect, it } from 'vitest'

import { assertGitOk } from './gitContract'

describe('assertGitOk', () => {
  it('accepts success result', () => {
    expect(() => assertGitOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit git error', () => {
    expect(() => assertGitOk({ ok: false, error: '[GIT_NOT_FOUND] not a repository' })).toThrow(
      '[GIT_NOT_FOUND] not a repository'
    )
  })

  it('throws on malformed response payload', () => {
    expect(() => assertGitOk('oops', 'Custom fallback')).toThrow('Custom fallback (invalid response payload)')
  })
})
