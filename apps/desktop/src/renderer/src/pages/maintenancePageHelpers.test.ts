import { describe, expect, it } from 'vitest'
import { maintenanceStatusTone } from './maintenancePageHelpers'

describe('maintenanceStatusTone', () => {
  it('treats diagnostics-with-issues as warning, not success', () => {
    expect(maintenanceStatusTone('Diagnostics completed with 2 issue(s).')).toBe('warning')
  })

  it('treats diagnostics passed as success', () => {
    expect(maintenanceStatusTone('Diagnostics passed.')).toBe('success')
    expect(maintenanceStatusTone('All good: diagnostics passed')).toBe('success')
  })

  it('treats support bundle export as success', () => {
    expect(maintenanceStatusTone('Support bundle exported: /tmp/x (redacted)')).toBe('success')
  })
})
