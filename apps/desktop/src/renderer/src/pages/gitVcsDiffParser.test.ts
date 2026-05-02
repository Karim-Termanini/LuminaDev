import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from './gitVcsDiffParser'

const SAMPLE_DIFF = `@@ -1,4 +1,5 @@
 line one
-line two
+line two changed
+line two b
 line three
 line four`

describe('parseUnifiedDiff', () => {
  it('parses a single hunk', () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].header).toContain('@@')
  })

  it('correctly types added lines', () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const added = hunks[0].lines.filter((l) => l.type === '+')
    expect(added).toHaveLength(2)
    expect(added[0].content).toBe('line two changed')
  })

  it('correctly types removed lines', () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const removed = hunks[0].lines.filter((l) => l.type === '-')
    expect(removed).toHaveLength(1)
    expect(removed[0].content).toBe('line two')
  })

  it('correctly types context lines', () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const context = hunks[0].lines.filter((l) => l.type === ' ')
    expect(context).toHaveLength(3)
  })

  it('returns empty array for empty input', () => {
    expect(parseUnifiedDiff('')).toHaveLength(0)
  })

  it('tracks line numbers', () => {
    const hunks = parseUnifiedDiff(SAMPLE_DIFF)
    const firstContext = hunks[0].lines.find((l) => l.type === ' ')
    expect(firstContext?.oldNum).toBe(1)
    expect(firstContext?.newNum).toBe(1)
  })
})
