import { describe, expect, it } from 'vitest'

import { gitErrorString } from './gitError'

describe('gitErrorString', () => {
  it('maps permission issues', () => {
    expect(gitErrorString(new Error('permission denied writing .git/config'), 'fallback')).toMatch(
      /^\[GIT_PERMISSION_DENIED\]/
    )
  })

  it('maps repository not found issues', () => {
    expect(gitErrorString(new Error('fatal: not a git repository'), 'fallback')).toMatch(/^\[GIT_NOT_FOUND\]/)
  })

  it('maps network issues', () => {
    expect(gitErrorString(new Error('Could not resolve host: github.com'), 'fallback')).toMatch(/^\[GIT_NETWORK\]/)
  })

  it('falls back to unknown code', () => {
    expect(gitErrorString(new Error('random git failure'), 'fallback')).toMatch(/^\[GIT_UNKNOWN\]/)
  })
})
