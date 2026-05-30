import { describe, expect, it } from 'vitest'

import { PR_BODY_DEFAULT_TEMPLATE } from './gitAssistantPrBodyTemplate'

describe('PR_BODY_DEFAULT_TEMPLATE', () => {
  it('includes review checklist sections', () => {
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Summary')
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Scope Check')
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Test Evidence')
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Docs Check')
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Notes')
    expect(PR_BODY_DEFAULT_TEMPLATE).toContain('Risks / follow-ups / deferred items:')
    expect(PR_BODY_DEFAULT_TEMPLATE.match(/\[\]/g)?.length).toBe(12)
    expect(PR_BODY_DEFAULT_TEMPLATE.match(/^---$/gm)?.length).toBe(6)
  })
})
