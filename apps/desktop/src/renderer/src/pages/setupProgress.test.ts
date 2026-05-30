import { describe, expect, it } from 'vitest'
import {
  INSTALL_PROGRESS_END,
  INSTALL_PROGRESS_START,
  progressFromInstallLog,
  stackWaitProgress,
} from './setupProgress'

describe('setupProgress', () => {
  it('maps pip percentage into install band', () => {
    const p = progressFromInstallLog('Downloading numpy-1.26.0 (50%)', INSTALL_PROGRESS_START)
    expect(p).toBeGreaterThan(80)
    expect(p).toBeLessThan(90)
  })

  it('creeps slowly on generic install lines', () => {
    const p1 = progressFromInstallLog('Collecting pandas', INSTALL_PROGRESS_START)
    const p2 = progressFromInstallLog('Installing collected packages', p1)
    expect(p2).toBeGreaterThan(p1)
    expect(p2).toBeLessThanOrEqual(INSTALL_PROGRESS_END)
  })

  it('stack wait never exceeds cap', () => {
    expect(stackWaitProgress(0, 60, 70)).toBeLessThanOrEqual(80)
    expect(stackWaitProgress(59, 60, 70)).toBeLessThanOrEqual(80)
  })
})
