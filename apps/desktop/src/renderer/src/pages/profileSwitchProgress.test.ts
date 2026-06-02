import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

import {
  PROFILE_SWITCH_STORAGE_KEY,
  dismissProfileSwitchError,
  getProfileSwitchSnapshot,
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
  signalProfileSwitchStep,
} from './profileSwitchProgress'

describe('profileSwitchProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      dh: {
        profileRunningStatus: vi.fn().mockResolvedValue({ ok: true, running: [] }),
      },
    })
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
    signalProfileSwitchDone()
    localStorage.removeItem(PROFILE_SWITCH_STORAGE_KEY)
  })

  it('does not decrease progress while the same switch is active', () => {
    signalProfileSwitchStarting('My Profile')
    signalProfileSwitchStep('Pulling images...', 25)
    signalProfileSwitchStep('Still working...', 12)
    expect(getProfileSwitchSnapshot().progress).toBe(25)
  })

  it('persists progress to localStorage', () => {
    signalProfileSwitchStarting('Lab')
    signalProfileSwitchStep('Building...', 40)
    const raw = localStorage.getItem(PROFILE_SWITCH_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { profile: string; progress: number }
    expect(parsed.profile).toBe('Lab')
    expect(parsed.progress).toBe(40)
  })

  it('keeps failed state until dismissed and ignores progress events', () => {
    signalProfileSwitchStarting('Lab')
    signalProfileSwitchFailed('pip install failed')
    expect(getProfileSwitchSnapshot().failed).toBe(true)
    expect(getProfileSwitchSnapshot().active).toBe(true)
    signalProfileSwitchStep('Should not apply', 50)
    expect(getProfileSwitchSnapshot().step).toBe('pip install failed')
    dismissProfileSwitchError()
    expect(getProfileSwitchSnapshot().active).toBe(false)
  })

  it('skipPoll does not mark failed while compose is still starting', async () => {
    vi.useFakeTimers()
    signalProfileSwitchStarting('Lab', { skipPoll: true })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(getProfileSwitchSnapshot().failed).toBe(false)
    vi.useRealTimers()
  })
})
