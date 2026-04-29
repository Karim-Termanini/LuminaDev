import { describe, expect, it } from 'vitest'

import { evaluateAccessibilitySnapshot } from './accessibilityAudit'

describe('evaluateAccessibilitySnapshot', () => {
  it('passes healthy baseline snapshot', () => {
    const res = evaluateAccessibilitySnapshot({
      unlabeledInputs: 0,
      unlabeledButtons: 0,
      imagesMissingAlt: 0,
      focusableCount: 9,
      landmarksCount: 3,
    })
    expect(res.ok).toBe(true)
  })

  it('fails when labels are missing', () => {
    const res = evaluateAccessibilitySnapshot({
      unlabeledInputs: 1,
      unlabeledButtons: 0,
      imagesMissingAlt: 0,
      focusableCount: 9,
      landmarksCount: 3,
    })
    expect(res.ok).toBe(false)
    expect(res.details).toContain('unlabeledInputs=1')
  })
})
