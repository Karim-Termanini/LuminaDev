import { describe, expect, it } from 'vitest'

import { guessDefaultBaseBranch } from './gitAssistantDefaultBranch'
import { isDefaultIntegrationBranch } from './gitAssistantPullRequestUrl'

describe('guessDefaultBaseBranch', () => {
  it('prefers main then master', () => {
    expect(guessDefaultBaseBranch(['develop', 'feature/x'])).toBe('main')
    expect(guessDefaultBaseBranch(['master', 'feature/x'])).toBe('master')
  })
})

describe('isDefaultIntegrationBranch', () => {
  it('allows feature and develop as PR heads', () => {
    expect(isDefaultIntegrationBranch('develop')).toBe(false)
    expect(isDefaultIntegrationBranch('feature/foo')).toBe(false)
    expect(isDefaultIntegrationBranch('main')).toBe(true)
  })
})
