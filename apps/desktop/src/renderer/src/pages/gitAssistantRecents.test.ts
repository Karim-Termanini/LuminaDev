import { describe, expect, it } from 'vitest'

import { formatRecentOpened, recentRepoBasename, recentRepoParentHint } from './gitAssistantRecents'

describe('gitAssistantRecents', () => {
  it('formats recent opened relative times', () => {
    const now = 1_700_000_000_000
    expect(formatRecentOpened(now - 30_000, now)).toBe('just now')
    expect(formatRecentOpened(now - 3_600_000, now)).toBe('1h ago')
    expect(formatRecentOpened(now - 86_400_000, now)).toBe('yesterday')
  })

  it('extracts basename and parent hint', () => {
    expect(recentRepoBasename('/home/me/proj/widget')).toBe('widget')
    expect(recentRepoParentHint('/home/me/proj/widget')).toBe('/home/me/proj')
  })
})
