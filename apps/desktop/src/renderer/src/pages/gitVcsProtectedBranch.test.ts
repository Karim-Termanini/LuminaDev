import { describe, expect, it } from 'vitest'
import { isPlausibleGitBranchName, suggestBypassBranchName } from './gitVcsProtectedBranch'

describe('suggestBypassBranchName', () => {
  it('uses feat/slug for main', () => {
    const taken = new Set<string>()
    expect(suggestBypassBranchName('main', taken)).toBe('feat/from-main')
  })

  it('uses feat/from-master for master', () => {
    expect(suggestBypassBranchName('master', new Set())).toBe('feat/from-master')
  })

  it('slugifies topic branches', () => {
    expect(suggestBypassBranchName('fix-bug-123', new Set())).toBe('feat/fix-bug-123')
  })

  it('avoids collision with numeric suffix', () => {
    const taken = new Set(['feat/from-main'])
    expect(suggestBypassBranchName('main', taken)).toBe('feat/from-main-2')
  })
})

describe('isPlausibleGitBranchName', () => {
  it('accepts common names', () => {
    expect(isPlausibleGitBranchName('feat/foo-bar')).toBe(true)
  })

  it('rejects spaces and odd patterns', () => {
    expect(isPlausibleGitBranchName('bad name')).toBe(false)
    expect(isPlausibleGitBranchName('a..b')).toBe(false)
    expect(isPlausibleGitBranchName('')).toBe(false)
  })
})
