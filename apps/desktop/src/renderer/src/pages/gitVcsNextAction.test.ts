import { describe, expect, it } from 'vitest'
import { computeGitVcsNextAction, nextActionButtonStyle } from './gitVcsNextAction'

const base = () => ({
  gitOperation: 'none' as const,
  conflictFileCount: 0,
  stagedCount: 0,
  unstagedCount: 0,
  ahead: null as number | null,
  behind: null as number | null,
  commitMessageTrimmed: '',
})

describe('computeGitVcsNextAction', () => {
  it('prefers resolution studio when there are conflicts', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        conflictFileCount: 1,
        stagedCount: 2,
        behind: 3,
        commitMessageTrimmed: 'msg',
      }),
    ).toBe('resolution_studio')
  })

  it('continue merge/rebase when in progress and conflicts cleared', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        gitOperation: 'merging',
        conflictFileCount: 0,
      }),
    ).toBe('continue_merge')
  })

  it('pull when behind (over local changes)', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        unstagedCount: 1,
        behind: 2,
        commitMessageTrimmed: 'x',
      }),
    ).toBe('pull')
  })

  it('commit message when dirty and message empty', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        stagedCount: 1,
        commitMessageTrimmed: '   ',
      }),
    ).toBe('commit_message')
  })

  it('commit when dirty and message present', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        stagedCount: 1,
        commitMessageTrimmed: 'fix: thing',
      }),
    ).toBe('commit')
  })

  it('push when ahead and not behind', () => {
    expect(
      computeGitVcsNextAction({
        ...base(),
        ahead: 2,
        behind: 0,
      }),
    ).toBe('push')
  })

  it('returns null when idle', () => {
    expect(computeGitVcsNextAction(base())).toBe(null)
  })
})

describe('nextActionButtonStyle', () => {
  it('adds ring when next matches want', () => {
    const s = nextActionButtonStyle('pull', 'pull', { padding: 4 })
    expect(s.boxShadow).toBeDefined()
    expect(s.padding).toBe(4)
  })

  it('returns base only when no match', () => {
    const s = nextActionButtonStyle('push', 'pull', { padding: 4 })
    expect(s.boxShadow).toBeUndefined()
    expect(s.padding).toBe(4)
  })
})
