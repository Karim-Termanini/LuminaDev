import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import i18n from 'i18next'
import { humanizeScaffoldError } from './scaffoldError'
import {
  completeProfileSwitchFromProfiles,
  getProfileSwitchSnapshot,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
  signalProfileSwitchStep,
} from './profileSwitchProgress'
import {
  beginSetupRun,
  clearSetupSession,
  isSetupRunActive,
  persistSetupSession,
  readSetupSession,
  type SetupSession,
} from './projectSetupSession'
import {
  INSTALL_PROGRESS_END,
  INSTALL_PROGRESS_START,
  progressFromInstallLog,
  stackWaitProgress,
} from './setupProgress'

export type BackgroundProjectSetupOptions = {
  profileName: string
  projectName: string
  projectPath: string
  template: 'data-science' | 'web-dev'
  toolchain?: 'python' | 'r' | 'both'
  onToast: (message: string, type: 'success' | 'error', opts?: { persist?: boolean }) => void
  /** Skip compose up when stack is already running (resume after app restart). */
  skipStackStart?: boolean
}

const STACK_WAIT_MS = 2000
const STACK_MAX_ATTEMPTS = 60
const INSTALL_CREEP_MS = 2500

let resumeScheduled = false

function friendlyInstallStep(raw: string): string {
  const line = raw.trim()
  const lower = line.toLowerCase()
  if (!line) return i18n.t('main.setup.installingLibraries')
  if (lower.includes('waiting for container')) return i18n.t('main.setup.waitingForStack')
  if (lower.includes('container is ready')) return i18n.t('main.setup.stackReady')
  if (lower.includes('pip') || lower.includes('requirements.txt')) {
    return i18n.t('main.setup.installingPythonLibs')
  }
  if (lower.includes('install.r') || lower.includes('r package') || lower.includes('rscript')) {
    return i18n.t('main.setup.installingRLibs')
  }
  if (lower.includes('downloading') || lower.includes('pulling')) {
    return i18n.t('main.setup.downloadingImages')
  }
  if (line.length > 96) return `${line.slice(0, 93)}…`
  return line
}

async function isProfileRunning(profileName: string): Promise<boolean> {
  try {
    const res = (await invoke('ipc_invoke', {
      channel: 'dh:profile:running-status',
      payload: { names: [profileName] },
    })) as { ok?: boolean; running?: string[] }
    return Boolean(res.ok && res.running?.includes(profileName))
  } catch {
    return false
  }
}

/** Waits until Docker reports the profile stack as running (or times out). */
export async function waitForProfileContainers(
  profileName: string,
  runGen?: number
): Promise<boolean> {
  for (let attempt = 0; attempt < STACK_MAX_ATTEMPTS; attempt++) {
    if (runGen !== undefined && !isSetupRunActive(runGen)) return false
    if (await isProfileRunning(profileName)) {
      const pct = Math.max(getProfileSwitchSnapshot().progress, INSTALL_PROGRESS_START)
      signalProfileSwitchStep(i18n.t('main.setup.stackReady'), pct)
      return true
    }
    const pct = stackWaitProgress(attempt, STACK_MAX_ATTEMPTS, getProfileSwitchSnapshot().progress)
    signalProfileSwitchStep(i18n.t('main.setup.waitingForStack'), pct)
    await new Promise((r) => setTimeout(r, STACK_WAIT_MS))
  }
  return false
}

function sessionFromOpts(opts: BackgroundProjectSetupOptions) {
  return {
    profileName: opts.profileName,
    projectName: opts.projectName,
    projectPath: opts.projectPath,
    template: opts.template,
    toolchain: opts.toolchain ?? 'python',
  }
}

async function runInstallPhase(
  opts: BackgroundProjectSetupOptions,
  runGen: number
): Promise<'ok' | 'failed' | 'cancelled'> {
  const { profileName, projectName, projectPath, template, onToast } = opts
  const toolchain = opts.toolchain ?? 'python'

  persistSetupSession({ ...sessionFromOpts(opts), phase: 'install' })

  let unlistenInstall: (() => void) | undefined
  let installCreepTimer: ReturnType<typeof setInterval> | undefined
  let installProgress = Math.max(getProfileSwitchSnapshot().progress, INSTALL_PROGRESS_START)
  let lastInstallStep = i18n.t('main.setup.installingLibraries')
  signalProfileSwitchStep(lastInstallStep, installProgress)

  try {
    unlistenInstall = await listen<string>('project-install-log', (event) => {
      if (!isSetupRunActive(runGen)) return
      const raw = event.payload ?? ''
      lastInstallStep = friendlyInstallStep(raw)
      installProgress = progressFromInstallLog(raw, installProgress)
      signalProfileSwitchStep(lastInstallStep, installProgress)
    })

    installCreepTimer = setInterval(() => {
      if (!isSetupRunActive(runGen)) return
      const snap = getProfileSwitchSnapshot()
      if (snap.failed || installProgress >= INSTALL_PROGRESS_END) return
      installProgress = Math.min(INSTALL_PROGRESS_END, snap.progress + 0.2)
      signalProfileSwitchStep(lastInstallStep || snap.step, installProgress)
    }, INSTALL_CREEP_MS)

    const installRes = (await invoke('ipc_invoke', {
      channel: 'dh:project:install_deps',
      payload: {
        projectName,
        profileName,
        projectPath,
        template,
        toolchain,
      },
    })) as { ok?: boolean; error?: string; log?: string }

    if (!isSetupRunActive(runGen)) return 'cancelled'

    if (!installRes.ok) {
      const raw = installRes.error ?? installRes.log ?? i18n.t('main.toast.failedDeps')
      const errMsg = humanizeScaffoldError(raw)
      signalProfileSwitchFailed(errMsg)
      onToast(errMsg, 'error', { persist: true })
      return 'failed'
    }

    clearSetupSession()
    completeProfileSwitchFromProfiles(profileName, new Set([profileName]))
    onToast(i18n.t('main.toast.depsInstalled'), 'success')
    return 'ok'
  } finally {
    if (installCreepTimer) clearInterval(installCreepTimer)
    unlistenInstall?.()
  }
}

/** Starts Docker, waits for containers, then installs deps — no manual steps for beginners. */
export async function runBackgroundProjectSetup(
  opts: BackgroundProjectSetupOptions
): Promise<void> {
  const runGen = beginSetupRun()
  const { profileName, onToast } = opts

  persistSetupSession({ ...sessionFromOpts(opts), phase: 'starting' })
  signalProfileSwitchStarting(profileName, { skipPoll: true })

  try {
    if (!opts.skipStackStart) {
      persistSetupSession({ ...sessionFromOpts(opts), phase: 'stack' })
      signalProfileSwitchStep(i18n.t('main.setup.preparingDocker'), 20)

      const sw = (await invoke('ipc_invoke', {
        channel: 'dh:profile:switch',
        payload: { to: profileName },
      })) as { ok?: boolean; error?: string; log?: string }

      if (!isSetupRunActive(runGen)) return

      if (!sw.ok) {
        const errMsg = sw.error ?? sw.log ?? 'Profile switch failed'
        signalProfileSwitchFailed(errMsg)
        onToast(humanizeScaffoldError(errMsg), 'error', { persist: true })
        return
      }

      const stackUp = await waitForProfileContainers(profileName, runGen)
      if (!isSetupRunActive(runGen)) return

      if (!stackUp) {
        const errMsg = i18n.t('main.toast.setupFailedStack', { name: profileName })
        signalProfileSwitchFailed(errMsg)
        onToast(errMsg, 'error', { persist: true })
        return
      }
    } else {
      signalProfileSwitchStep(i18n.t('main.setup.resuming'), getProfileSwitchSnapshot().progress || 72)
      if (!(await isProfileRunning(profileName))) {
        const stackUp = await waitForProfileContainers(profileName, runGen)
        if (!isSetupRunActive(runGen)) return
        if (!stackUp) {
          const errMsg = i18n.t('main.toast.setupFailedStack', { name: profileName })
          signalProfileSwitchFailed(errMsg)
          onToast(errMsg, 'error', { persist: true })
          return
        }
      }
    }

    await runInstallPhase(opts, runGen)
  } catch (e) {
    if (!isSetupRunActive(runGen)) return
    const errMsg = e instanceof Error ? e.message : String(e)
    signalProfileSwitchFailed(errMsg)
    onToast(errMsg, 'error', { persist: true })
  }
}

function sessionToOpts(
  session: SetupSession,
  onToast: BackgroundProjectSetupOptions['onToast']
): BackgroundProjectSetupOptions {
  return {
    profileName: session.profileName,
    projectName: session.projectName,
    projectPath: session.projectPath,
    template: session.template,
    toolchain: session.toolchain,
    onToast,
  }
}

/** After app restart, continue an in-progress workspace setup if one was saved. */
export async function resumeBackgroundProjectSetupIfNeeded(
  onToast: BackgroundProjectSetupOptions['onToast']
): Promise<void> {
  if (resumeScheduled) return
  const session = readSetupSession()
  if (!session) return

  resumeScheduled = true
  try {
    const snap = getProfileSwitchSnapshot()
    if (!snap.active || snap.targetProfile !== session.profileName) {
      signalProfileSwitchStarting(session.profileName, { skipPoll: true })
      signalProfileSwitchStep(i18n.t('main.setup.resuming'), snap.progress || 15)
    } else if (!snap.failed) {
      signalProfileSwitchStep(i18n.t('main.setup.resuming'), snap.progress || 15)
    } else {
      return
    }

    const stackAlreadyUp = await isProfileRunning(session.profileName)

    await runBackgroundProjectSetup({
      ...sessionToOpts(session, onToast),
      skipStackStart: stackAlreadyUp,
    })
  } finally {
    resumeScheduled = false
  }
}
