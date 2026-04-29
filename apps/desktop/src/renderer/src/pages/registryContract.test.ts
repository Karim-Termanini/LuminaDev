import { describe, expect, it } from 'vitest'

import { assertGitRecentList } from './registryContract'

describe('assertGitRecentList', () => {
  it('returns repositories when payload is valid', () => {
    const repos = [{ path: '/tmp/repo', lastOpened: 1 }]
    expect(assertGitRecentList({ ok: true, repos })).toEqual(repos)
  })

  it('throws on explicit error result', () => {
    expect(() => assertGitRecentList({ ok: false, error: 'failed' })).toThrow('failed')
  })

  it('throws on invalid payload', () => {
    expect(() => assertGitRecentList('bad')).toThrow('invalid response payload')
  })
})
