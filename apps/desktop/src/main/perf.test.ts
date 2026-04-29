import { describe, expect, it } from 'vitest'

import { collectPerfSnapshot } from './perf'

describe('collectPerfSnapshot', () => {
  it('returns non-negative numeric perf values', () => {
    const snap = collectPerfSnapshot(Date.now() - 250)
    expect(snap.startupMs).toBeGreaterThanOrEqual(0)
    expect(snap.rssMb).toBeGreaterThan(0)
    expect(snap.heapUsedMb).toBeGreaterThan(0)
    expect(snap.heapTotalMb).toBeGreaterThan(0)
    expect(snap.uptimeSec).toBeGreaterThanOrEqual(0)
  })
})
