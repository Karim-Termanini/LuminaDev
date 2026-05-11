import { describe, expect, it } from 'vitest'
import type { BranchEntry } from '@linux-dev-home/shared'
import { computeBaseBranchOptions, defaultBaseBranch, stripRemoteBranchPrefix } from './gitVcsPrWizardBranch'

describe('stripRemoteBranchPrefix', () => {
  it('strips matching remote prefix', () => {
    expect(stripRemoteBranchPrefix('origin', 'origin/main')).toBe('main')
  })

  it('returns null when remote does not match', () => {
    expect(stripRemoteBranchPrefix('origin', 'upstream/main')).toBeNull()
  })
})

describe('computeBaseBranchOptions', () => {
  it('includes locals except current and strips active remote tracking', () => {
    const branches: BranchEntry[] = [
      { name: 'feat', remote: false, current: true },
      { name: 'develop', remote: false, current: false },
      { name: 'origin/main', remote: true, current: false },
      { name: 'origin/feat', remote: true, current: false },
    ]
    const opts = computeBaseBranchOptions(branches, 'feat', 'origin')
    expect(opts).toContain('main')
    expect(opts).toContain('develop')
    expect(opts).not.toContain('feat')
    expect(opts).not.toContain('origin/main')
  })

  it('dedupes local main and origin/main', () => {
    const branches: BranchEntry[] = [
      { name: 'topic', remote: false, current: true },
      { name: 'main', remote: false, current: false },
      { name: 'origin/main', remote: true, current: false },
    ]
    const opts = computeBaseBranchOptions(branches, 'topic', 'origin')
    expect(opts.filter((x) => x === 'main').length).toBe(1)
  })
})

describe('defaultBaseBranch', () => {
  it('prefers main over master', () => {
    expect(defaultBaseBranch(['master', 'main', 'dev'])).toBe('main')
  })

  it('falls back to first sorted candidate', () => {
    expect(defaultBaseBranch(['release', 'zoo'])).toBe('release')
  })
})
