import { dismissProfileSwitchError, signalProfileSwitchDone } from './profileSwitchProgress'

export const SETUP_SESSION_STORAGE_KEY = 'dh:setup:session:v1'
export const SETUP_SESSION_TTL_MS = 24 * 60 * 60 * 1000

export type SetupSessionPhase = 'starting' | 'stack' | 'install'

export type SetupSession = {
  profileName: string
  projectName: string
  projectPath: string
  template: 'data-science' | 'web-dev'
  toolchain: 'python' | 'r' | 'both'
  phase: SetupSessionPhase
  ts: number
}

let setupRunGeneration = 0

export function beginSetupRun(): number {
  setupRunGeneration += 1
  return setupRunGeneration
}

export function isSetupRunActive(generation: number): boolean {
  return generation === setupRunGeneration
}

export function invalidateSetupRuns(): void {
  setupRunGeneration += 1
}

export function persistSetupSession(session: Omit<SetupSession, 'ts'> & { ts?: number }): void {
  try {
    const data: SetupSession = { ...session, ts: session.ts ?? Date.now() }
    localStorage.setItem(SETUP_SESSION_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

export function readSetupSession(): SetupSession | null {
  try {
    const raw = localStorage.getItem(SETUP_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SetupSession>
    if (
      !parsed.profileName ||
      !parsed.projectName ||
      !parsed.projectPath ||
      !parsed.template ||
      !parsed.ts
    ) {
      return null
    }
    if (Date.now() - parsed.ts > SETUP_SESSION_TTL_MS) {
      localStorage.removeItem(SETUP_SESSION_STORAGE_KEY)
      return null
    }
    return {
      profileName: parsed.profileName,
      projectName: parsed.projectName,
      projectPath: parsed.projectPath,
      template: parsed.template,
      toolchain: parsed.toolchain ?? 'python',
      phase: parsed.phase ?? 'starting',
      ts: parsed.ts,
    }
  } catch {
    return null
  }
}

export function clearSetupSession(): void {
  try {
    localStorage.removeItem(SETUP_SESSION_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Clears persisted setup and hides progress UI without stopping the profile stack. */
export async function cancelProjectSetup(profileName: string): Promise<void> {
  invalidateSetupRuns()
  const session = readSetupSession()
  if (!session || session.profileName === profileName) {
    clearSetupSession()
  }
  signalProfileSwitchDone()
}

export function dismissSetupUi(): void {
  clearSetupSession()
  dismissProfileSwitchError()
}
