import { describe, expect, it } from 'vitest'

import { branchNeedsPublishBeforePr } from './gitAssistantPrPublish'

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
})
