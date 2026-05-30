import { describe, expect, it, vi, beforeEach } from 'vitest'
import { openSetupWizard, SETUP_WIZARD_OPEN_EVENT } from './setupWizard'

describe('openSetupWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      dh: {
        storeSet: vi.fn().mockResolvedValue({ ok: true }),
      },
      dispatchEvent: vi.fn(),
    })
  })

  it('marks first-run incomplete and dispatches open event', async () => {
    await openSetupWizard()
    expect(window.dh.storeSet).toHaveBeenCalledWith({
      key: 'first_run_wizard_complete',
      data: false,
    })
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: SETUP_WIZARD_OPEN_EVENT })
    )
  })
})
