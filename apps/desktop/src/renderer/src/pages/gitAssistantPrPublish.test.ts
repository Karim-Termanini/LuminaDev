import { describe, expect, it } from 'vitest'

import { branchNeedsPublishBeforePr, shouldShowGitPush } from './gitAssistantPrPublish'

describe('branchNeedsPublishBeforePr', () => {
  it('requires publish when there is no upstream', () => {
    expect(branchNeedsPublishBeforePr(null, null)).toBe(true)
  })

  it('requires publish when ahead of upstream', () => {
    expect(branchNeedsPublishBeforePr(2, 0)).toBe(true)
  })

  it('allows PR when even with upstream', () => {
    expect(branchNeedsPublishBeforePr(0, 0)).toBe(false)
    expect(branchNeedsPublishBeforePr(0, 3)).toBe(false)
  })

  it('allows PR when synced via origin tracking fallback (ahead 0, behind null)', () => {
    expect(branchNeedsPublishBeforePr(0, null)).toBe(false)
  })
})

describe('shouldShowGitPush', () => {
  const base = () => ({
    repoPathTrimmed: '/tmp/proj',
    hasLocalChanges: false,
    unborn: false,
    ahead: null as number | null,
    behind: null as number | null,
    conflictFileCount: 0,
    gitOperation: 'none',
  })

  it('shows push when there is no upstream', () => {
    expect(shouldShowGitPush(base())).toBe(true)
  })

  it('hides push when ahead is zero with upstream', () => {
    expect(shouldShowGitPush({ ...base(), ahead: 0, behind: 0 })).toBe(false)
  })

  it('hides push when there are local changes', () => {
    expect(shouldShowGitPush({ ...base(), hasLocalChanges: true })).toBe(false)
  })

  it('hides push for unborn repo', () => {
    expect(shouldShowGitPush({ ...base(), unborn: true })).toBe(false)
  })
})
