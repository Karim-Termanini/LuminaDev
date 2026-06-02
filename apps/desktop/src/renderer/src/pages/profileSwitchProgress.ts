import { listen } from '@tauri-apps/api/event'

/** Persisted while a profile stack is starting (survives navigation and refresh). */
export const PROFILE_SWITCH_STORAGE_KEY = 'dh:switch:pending'

const SWITCH_TTL_MS = 120_000
/** While a workspace setup session exists, keep progress UI restorable much longer. */
const SWITCH_TTL_WITH_SETUP_MS = 24 * 60 * 60 * 1000
const POLL_INTERVAL_MS = 3000
/** Fail only after this long with no backend progress events. */
const POLL_NO_PROGRESS_FAIL_MS = 5 * 60 * 1000
/** Hard cap so a stuck poll cannot run forever. */
const POLL_ABSOLUTE_MAX_MS = 20 * 60 * 1000

type SwitchPersisted = {
  profile: string
  step: string
  progress: number
  ts: number
  failed?: boolean
}

export type ProfileSwitchSnapshot = {
  active: boolean
  step: string
  progress: number
  targetProfile: string
  failed: boolean
}

const _sw: ProfileSwitchSnapshot = {
  active: false,
  step: '',
  progress: 0,
  targetProfile: '',
  failed: false,
}
let _swSkipPoll = false
let _swListeners: Array<() => void> = []
let _swPollTarget: string | null = null
let _swPollGeneration = 0
let _swEventsBound = false
let _swLastProgressAt = 0
let _swPollStartedAt = 0

function _swNotify(): void {
  _swListeners.forEach((fn) => fn())
}

function _switchStorageTtlMs(): number {
  try {
    if (localStorage.getItem('dh:setup:session:v1')) return SWITCH_TTL_WITH_SETUP_MS
  } catch {
    /* ignore */
  }
  return SWITCH_TTL_MS
}

function _swPersist(): void {
  if (!_sw.active) {
    try {
      localStorage.removeItem(PROFILE_SWITCH_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  try {
    const data: SwitchPersisted = {
      profile: _sw.targetProfile,
      step: _sw.step,
      progress: _sw.progress,
      ts: Date.now(),
      failed: _sw.failed,
    }
    localStorage.setItem(PROFILE_SWITCH_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

function _swStopPoll(): void {
  _swPollTarget = null
  _swPollGeneration += 1
}

function _swSet(patch: Partial<ProfileSwitchSnapshot>, opts?: { resetProgress?: boolean }): void {
  const next = { ...patch }
  if (patch.active === false) {
    Object.assign(_sw, {
      active: false,
      step: '',
      progress: 0,
      targetProfile: '',
      failed: false,
    })
    _swSkipPoll = false
    _swStopPoll()
    _swPersist()
    _swNotify()
    return
  }
  if (next.progress !== undefined && !opts?.resetProgress && _sw.active && !_sw.failed) {
    next.progress = Math.max(_sw.progress, next.progress)
  }
  Object.assign(_sw, next)
  _swPersist()
  if (_sw.active && _sw.targetProfile && !_swSkipPoll && !_sw.failed) {
    _swEnsurePollRunning()
  }
  _swNotify()
}

function _swRestoreFromStorage(): void {
  if (_sw.active) return
  try {
    const raw = localStorage.getItem(PROFILE_SWITCH_STORAGE_KEY)
    if (!raw) return
    const pending = JSON.parse(raw) as Partial<SwitchPersisted>
    const profile = pending.profile
    const ts = pending.ts ?? 0
    if (!profile || Date.now() - ts > _switchStorageTtlMs()) {
      localStorage.removeItem(PROFILE_SWITCH_STORAGE_KEY)
      return
    }
    Object.assign(_sw, {
      active: true,
      targetProfile: profile,
      step: pending.step || 'Waiting for containers...',
      progress: typeof pending.progress === 'number' ? pending.progress : 10,
      failed: Boolean(pending.failed),
    })
    // Restored state never auto-polls; resumeBackgroundProjectSetup re-drives the poll.
    _swSkipPoll = true
    _swPersist()
  } catch {
    /* ignore */
  }
}

function _swTouchProgress(): void {
  _swLastProgressAt = Date.now()
}

async function _swPollUntilRunning(target: string, generation: number): Promise<void> {
  _swPollStartedAt = Date.now()
  _swTouchProgress()
  while (generation === _swPollGeneration && _sw.active && _sw.targetProfile === target && !_sw.failed && !_swSkipPoll) {
    if (Date.now() - _swPollStartedAt > POLL_ABSOLUTE_MAX_MS) {
      break
    }
    try {
      const res = await window.dh.profileRunningStatus({ names: [target] })
      if (res.ok && res.running?.includes(target)) {
        if (!_sw.failed) {
          signalProfileSwitchStep('Stack running', 100)
          setTimeout(() => {
            if (!_sw.failed) signalProfileSwitchDone()
          }, 800)
        }
        return
      }
    } catch {
      /* ignore */
    }
    const idleMs = Date.now() - _swLastProgressAt
    if (idleMs > POLL_NO_PROGRESS_FAIL_MS) {
      break
    }
    const elapsedSec = Math.floor((Date.now() - _swPollStartedAt) / 1000)
    const pollPct = Math.min(79, 71 + Math.min(8, Math.floor(elapsedSec / 45)))
    _swSet({
      step: `Waiting for containers (${elapsedSec}s)...`,
      progress: pollPct,
    })
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  if (
    generation === _swPollGeneration &&
    _sw.active &&
    _sw.targetProfile === target &&
    !_sw.failed &&
    !_swSkipPoll
  ) {
    signalProfileSwitchFailed(
      'Containers did not start in time. Check Docker logs or enable FULL stack on the profile.'
    )
  }
}

function _swEnsurePollRunning(): void {
  if (!_sw.active || !_sw.targetProfile || _swSkipPoll || _sw.failed) {
    _swStopPoll()
    return
  }
  if (_swPollTarget === _sw.targetProfile) return
  _swPollTarget = _sw.targetProfile
  const generation = ++_swPollGeneration
  const target = _sw.targetProfile
  void _swPollUntilRunning(target, generation)
}

export function bindProfileSwitchProgressEvents(): void {
  if (_swEventsBound) return
  _swEventsBound = true
  void listen<{ step: string; progress: number }>('profile-switch-progress', (event) => {
    if (_sw.failed) return
    _swTouchProgress()
    _swSet({ step: event.payload.step, progress: event.payload.progress })
  })
}

export function subscribeProfileSwitchState(fn: () => void): () => void {
  _swListeners.push(fn)
  return () => {
    _swListeners = _swListeners.filter((l) => l !== fn)
  }
}

export function getProfileSwitchSnapshot(): ProfileSwitchSnapshot {
  return { ..._sw }
}

/** Call once when the dashboard shell mounts. */
export function initProfileSwitchProgress(): void {
  bindProfileSwitchProgressEvents()
  _swRestoreFromStorage()
  if (_sw.active && !_swSkipPoll && !_sw.failed) _swEnsurePollRunning()
}

export function signalProfileSwitchStarting(
  profileName: string,
  opts?: { skipPoll?: boolean }
): void {
  if (_sw.active && _sw.targetProfile === profileName && !_sw.failed) {
    return
  }
  _swStopPoll()
  _swSkipPoll = Boolean(opts?.skipPoll)
  _swTouchProgress()
  _swSet(
    {
      active: true,
      step: 'Starting...',
      progress: 2,
      targetProfile: profileName,
      failed: false,
    },
    { resetProgress: true }
  )
}

export function signalProfileSwitchStep(step: string, progress: number): void {
  if (!_sw.active || _sw.failed) return
  _swTouchProgress()
  _swSet({ step, progress })
}

export function signalProfileSwitchDone(): void {
  _swSet({ active: false })
}

/** Keeps the progress card visible with the error until the user dismisses it. */
export function signalProfileSwitchFailed(error: string): void {
  _swStopPoll()
  _swSkipPoll = true
  Object.assign(_sw, {
    active: true,
    step: error,
    failed: true,
  })
  _swPersist()
  _swNotify()
}

export function dismissProfileSwitchError(): void {
  signalProfileSwitchDone()
}

/** Profiles page: IPC returned OK (backend verified running) or still waiting. */
export function completeProfileSwitchFromProfiles(
  profileName: string,
  runningNow: Set<string>
): 'done' | 'waiting' {
  if (runningNow.has(profileName)) {
    signalProfileSwitchStep('Complete', 100)
    setTimeout(() => signalProfileSwitchDone(), 800)
    return 'done'
  }
  if (!_sw.failed) {
    _swSet({ step: 'Waiting for containers...' })
  }
  return 'waiting'
}
