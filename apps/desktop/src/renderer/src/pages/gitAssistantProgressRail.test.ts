import { describe, expect, it } from 'vitest'
import { computeGitProgressRail } from './gitAssistantProgressRail'

describe('computeGitProgressRail', () => {
  it('marks Share incomplete when GitHub is not connected', () => {
    const rail = computeGitProgressRail({
      setupComplete: true,
      projectComplete: true,
      saveComplete: true,
      githubConnected: false,
      ahead: 0,
    })
    expect(rail.share).toBe('incomplete')
    expect(rail.active).toBe('share')
  })

  it('marks Share complete when GitHub connected and nothing to push', () => {
    const rail = computeGitProgressRail({
      setupComplete: true,
      projectComplete: true,
      saveComplete: true,
      githubConnected: true,
      ahead: 0,
    })
    expect(rail.share).toBe('complete')
    expect(rail.active).toBe(null)
  })

  it('marks Share incomplete when ahead commits remain', () => {
    const rail = computeGitProgressRail({
      setupComplete: true,
      projectComplete: true,
      saveComplete: true,
      githubConnected: true,
      ahead: 2,
    })
    expect(rail.share).toBe('incomplete')
    expect(rail.active).toBe('share')
  })

  it('activates first incomplete step in order', () => {
    const rail = computeGitProgressRail({
      setupComplete: false,
      projectComplete: false,
      saveComplete: false,
      githubConnected: false,
      ahead: null,
    })
    expect(rail.active).toBe('setup')
  })
})
