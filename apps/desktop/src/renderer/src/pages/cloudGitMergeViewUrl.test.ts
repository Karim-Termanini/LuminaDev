import { describe, expect, it } from 'vitest'
import { cloudGitMergeViewUrl } from './cloudGitMergeViewUrl'

describe('cloudGitMergeViewUrl', () => {
  it('builds GitHub merge URL', () => {
    expect(cloudGitMergeViewUrl('github', 'https://github.com/acme/widget/pull/12')).toBe(
      'https://github.com/acme/widget/pull/12/merge',
    )
  })

  it('normalizes GitHub URL that already ends with /merge', () => {
    expect(cloudGitMergeViewUrl('github', 'https://github.com/acme/widget/pull/12/merge')).toBe(
      'https://github.com/acme/widget/pull/12/merge',
    )
  })

  it('supports GitHub Enterprise-style hosts', () => {
    expect(cloudGitMergeViewUrl('github', 'https://git.corp.example/org/repo/pull/1')).toBe(
      'https://git.corp.example/org/repo/pull/1/merge',
    )
  })

  it('strips query before parsing GitHub', () => {
    expect(cloudGitMergeViewUrl('github', 'https://github.com/o/r/pull/3?tab=files')).toBe(
      'https://github.com/o/r/pull/3/merge',
    )
  })

  it('builds GitLab merge URL', () => {
    expect(cloudGitMergeViewUrl('gitlab', 'https://gitlab.com/group/sub/-/merge_requests/44')).toBe(
      'https://gitlab.com/group/sub/-/merge_requests/44/merge',
    )
  })

  it('builds GitLab self-managed merge URL', () => {
    expect(cloudGitMergeViewUrl('gitlab', 'https://gl.internal/a/b/-/merge_requests/9')).toBe(
      'https://gl.internal/a/b/-/merge_requests/9/merge',
    )
  })

  it('returns null for unrecognized URLs', () => {
    expect(cloudGitMergeViewUrl('github', 'https://codeberg.org/a/b/pulls/1')).toBeNull()
    expect(cloudGitMergeViewUrl('gitlab', 'https://github.com/o/r/pull/1')).toBeNull()
  })
})
