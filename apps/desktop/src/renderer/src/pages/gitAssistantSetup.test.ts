import { describe, expect, it } from 'vitest'
import { evaluateGitSetupChecklist, isGitSetupComplete } from './gitAssistantSetup'

describe('isGitSetupComplete', () => {
  it('does not require GitHub for local-only setup', () => {
    const items = evaluateGitSetupChecklist(
      new Map([
        ['user.name', 'A'],
        ['user.email', 'a@b.com'],
        ['credential.helper', 'cache'],
        ['init.defaultbranch', 'main'],
      ]),
      false,
    )
    expect(isGitSetupComplete(items)).toBe(true)
  })
})
