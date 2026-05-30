import { describe, expect, it } from 'vitest'
import { computeGitAssistantNextAction } from './gitAssistantNextAction'

const base = () => ({
  cloudConnected: true,
  repoPathTrimmed: '/home/me/proj',
  gitOperation: 'none' as const,
  conflictFileCount: 0,
  stagedCount: 0,
  unstagedCount: 0,
  ahead: null as number | null,
  behind: null as number | null,
  commitMessageTrimmed: '',
})

describe('computeGitAssistantNextAction', () => {
  it('open project when no repo', () => {
    expect(computeGitAssistantNextAction({ ...base(), repoPathTrimmed: '' })).toBe('open_project')
  })

  it('connect cloud when ahead but not connected', () => {
    expect(
      computeGitAssistantNextAction({
        ...base(),
        cloudConnected: false,
        ahead: 1,
        behind: 0,
      }),
    ).toBe('connect_cloud')
  })

  it('does not block local idle workflow when cloud disconnected and in sync', () => {
    expect(
      computeGitAssistantNextAction({
        ...base(),
        cloudConnected: false,
        ahead: 0,
        behind: 0,
      }),
    ).toBe(null)
  })

  it('connect cloud when branch has no upstream and cloud disconnected', () => {
    expect(computeGitAssistantNextAction({ ...base(), cloudConnected: false })).toBe('connect_cloud')
  })

  it('commit when dirty even if cloud disconnected', () => {
    expect(
      computeGitAssistantNextAction({
        ...base(),
        cloudConnected: false,
        stagedCount: 1,
        commitMessageTrimmed: 'fix: local only',
      }),
    ).toBe('commit')
  })

  it('open editor when conflicts', () => {
    expect(computeGitAssistantNextAction({ ...base(), conflictFileCount: 1 })).toBe('open_editor')
  })

  it('push when ahead and cloud connected', () => {
    expect(
      computeGitAssistantNextAction({
        ...base(),
        ahead: 2,
        behind: 0,
      }),
    ).toBe('push')
  })

  it('push when branch has no upstream and cloud connected', () => {
    expect(computeGitAssistantNextAction({ ...base() })).toBe('push')
  })
})
