import {
  type ComposeProfile,
  type ContainerRow,
  type HostMetricsResponse,
  type HostSecuritySnapshot,
  type JobSummary,
  type MaintenanceProfileHealth,
  type MaintenanceStateStore,
  type MaintenanceTask,
  type PerfSnapshot,
  type TopProcessRow,
} from '@linux-dev-home/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { humanizeDashboardError } from '../dashboardError'
import { humanizeDockerError } from '../dockerError'
import { humanizeRuntimeError } from '../runtimeError'
import { collectAccessibilitySnapshot, evaluateAccessibilitySnapshot } from '../accessibilityAudit'
import { evaluateGuardian, type GuardianLayerId } from '../maintenanceGuardian'
import {
  getGuardianLayerPressureScore,
  getMaintenanceOverallLevel,
  getMaintenancePressureLevel,
} from '../maintenanceHealth'
import { type RunbookOp } from '../maintenancePageHelpers'
import {
  isUnitNotFoundError,
  MAINTENANCE_SYSTEMD_SERVICES,
  normalizeSystemdState,
  type SystemdServiceId,
} from '../maintenanceSystemdServices'
import { DEFAULT_DOCKER_CLEANUP_SELECTION, profileIds, STATUS_AUTO_DISMISS_MS } from './constants'
import { buildMonitorLayerPath, resolveGuardianLayerTarget } from './maintenanceGuardianActions'
import type { DiagnosticCheck, ServiceState, TabId } from './types'

export function useMaintenancePage() {
  const { t } = useTranslation('maintenance')
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('Overview / Health Dashboard')
  const [metrics, setMetrics] = useState<HostMetricsResponse | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [topProcesses, setTopProcesses] = useState<TopProcessRow[]>([])
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [state, setState] = useState<MaintenanceStateStore>({ tasks: [], profileHealth: [], history: [] })
  const [serviceState, setServiceState] = useState<ServiceState>({
    ssh: 'unknown',
    nginx: 'unknown',
    ufw: 'unknown',
  })
  const [recommendedSelection, setRecommendedSelection] = useState({
    clearCache: true,
    pruneDocker: true,
    cleanLogs: true,
  })
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newCron, setNewCron] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [savingState, setSavingState] = useState(false)
  const [busyCleanup, setBusyCleanup] = useState(false)
  const [runningDiagnostics, setRunningDiagnostics] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[]>([])
  const [includeSensitiveBundle, setIncludeSensitiveBundle] = useState(false)
  const [status, setStatus] = useState('')
  const [statusTone, setStatusTone] = useState<'success' | 'warning'>('warning')
  const [runbook, setRunbook] = useState<{ title: string; text: string } | null>(null)
  const [runbookBusyId, setRunbookBusyId] = useState<string | null>(null)
  const [systemdBusy, setSystemdBusy] = useState<Partial<Record<SystemdServiceId, boolean>>>({})
  const [systemdError, setSystemdError] = useState<Partial<Record<SystemdServiceId, string>>>({})
  const [commandPeek, setCommandPeek] = useState<string | null>(null)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const saveState = useCallback(async (next: MaintenanceStateStore) => {
    setSavingState(true)
    try {
      await window.dh.storeSet({ key: 'maintenance_state', data: next })
      setState(next)
      showStatus(t('page.statusSaved'), 'success')
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingState(false)
    }
  }, [t])

  const refreshLive = useCallback(async () => {
    try {
      const m = await window.dh.metrics()
      if (m.ok) {
        setMetrics(m)
      } else {
        showStatus(humanizeDashboardError(m.error))
      }
      const c = (await window.dh.dockerList()) as { ok: boolean; rows: ContainerRow[]; error?: string }
      if (c.ok) setContainers(c.rows)
      else showStatus(humanizeDockerError(c.error))
      const proc = await window.dh.monitorTopProcesses()
      if (proc && 'processes' in proc && Array.isArray(proc.processes)) {
        setTopProcesses(proc.processes)
      }
      const j = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(j) ? j : [])
    } catch (e) {
      showStatus(humanizeDashboardError(e))
    }
  }, [])

  const refreshSystemdSnapshot = useCallback(async () => {
    const next: ServiceState = { ssh: 'unknown', nginx: 'unknown', ufw: 'unknown' }
    await Promise.all(
      MAINTENANCE_SYSTEMD_SERVICES.map(async (svc) => {
        try {
          const res = (await window.dh.hostExec({
            command: 'systemctl_is_active_fallback',
            units: svc.probeUnits,
          })) as { ok: boolean; result?: string; resolvedUnit?: string | null; error?: string }
          const out = (res.ok ? String(res.result ?? '') : '').trim().toLowerCase()
          const normalized = normalizeSystemdState(out)
          if (normalized === 'unknown' && !res.resolvedUnit) {
            next[svc.id] = svc.optional ? 'not_installed' : 'unknown'
          } else {
            next[svc.id] = normalized
          }
        } catch {
          next[svc.id] = svc.optional ? 'not_installed' : 'unknown'
        }
      }),
    )
    setServiceState(next)
  }, [])

  const startSystemdService = useCallback(async (serviceId: SystemdServiceId) => {
    const def = MAINTENANCE_SYSTEMD_SERVICES.find((s) => s.id === serviceId)
    if (!def || (def.optional && serviceState[serviceId] === 'not_installed')) return
    setSystemdBusy((prev) => ({ ...prev, [serviceId]: true }))
    setSystemdError((prev) => ({ ...prev, [serviceId]: '' }))
    let lastError = ''
    for (const unit of def.startUnits) {
      try {
        const res = (await window.dh.hostExec({
          command: 'systemctl_start',
          unit,
          user: false,
        })) as { ok: boolean; error?: string }
        if (res.ok) {
          await refreshSystemdSnapshot()
          showStatus(t('systemd.started', { service: t(def.titleKey) }), 'success')
          setSystemdBusy((prev) => ({ ...prev, [serviceId]: false }))
          return
        }
        lastError = res.error ?? t('systemd.startFailed')
        if (isUnitNotFoundError(lastError)) break
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        if (isUnitNotFoundError(lastError)) break
      }
    }
    if (isUnitNotFoundError(lastError)) {
      setServiceState((prev) => ({ ...prev, [serviceId]: def.optional ? 'not_installed' : 'unknown' }))
      setSystemdError((prev) => ({ ...prev, [serviceId]: '' }))
      showStatus(def.optional ? t('systemd.notInstalledOptional') : t('systemd.notInstalled'))
    } else {
      setSystemdError((prev) => ({ ...prev, [serviceId]: lastError }))
      showStatus(lastError)
    }
    setSystemdBusy((prev) => ({ ...prev, [serviceId]: false }))
  }, [refreshSystemdSnapshot, serviceState, t])

  const refreshStatic = useCallback(async () => {
    try {
      const sec = await window.dh.monitorSecurity()
      setSecurity(sec.ok ? sec.snapshot : null)
      if (!sec.ok && sec.error) {
        showStatus(humanizeDashboardError(sec.error))
      }
      const stored = await window.dh.storeGet({ key: 'maintenance_state' })
      if (stored.ok) {
        setState((stored.data as MaintenanceStateStore | null) ?? { tasks: [], profileHealth: [], history: [] })
      } else {
        setState({ tasks: [], profileHealth: [], history: [] })
        showStatus(stored.error || t('page.statusLoadError'))
      }
      await refreshSystemdSnapshot()
    } catch (e) {
      showStatus(humanizeDashboardError(e))
    }
  }, [refreshSystemdSnapshot, t])

  useEffect(() => {
    void refreshLive()
    void refreshStatic()
    const fast = setInterval(() => void refreshLive(), 2500)
    const slow = setInterval(() => void refreshStatic(), 15000)
    return () => {
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [refreshLive, refreshStatic])

  useEffect(() => {
    if (!status.trim()) return
    const id = window.setTimeout(() => setStatus(''), STATUS_AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [status])

  const m = metrics?.metrics
  const runningContainers = containers.filter((c) => c.state === 'running').length
  const guardian = useMemo(() => evaluateGuardian(m, security, containers, topProcesses), [m, security, containers, topProcesses])
  const guardianOverallLevel = useMemo(() => getMaintenanceOverallLevel(guardian.score), [guardian.score])

  const onGuardianLayerAction = useCallback(
    (layerId: GuardianLayerId) => {
      const pressureLevel = getMaintenancePressureLevel(
        getGuardianLayerPressureScore(layerId, m, containers, topProcesses, security)
      )
      const target = resolveGuardianLayerTarget(layerId, pressureLevel)
      if (target.kind === 'maintenanceTab') {
        setActiveTab(target.tab)
        return
      }
      if (target.kind === 'route') {
        navigate(target.path)
        return
      }
      navigate(buildMonitorLayerPath(target))
    },
    [m, containers, topProcesses, security, navigate]
  )
  const memPct = m && m.totalMemMb > 0 ? Math.round(((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100) : null
  const diskPct = m && m.diskTotalGb > 0 ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : null
  const activeJobCount = useMemo(() => jobs.filter((j) => j.state === 'running').length, [jobs])
  const pendingTasks = useMemo(() => state.tasks.filter((t) => !t.done), [state.tasks])
  const degradedProfiles = state.profileHealth.filter((p) => p.health === 'degraded').length
  const lastMaintenanceDaysAgo = state.lastMaintenanceAtIso
    ? Math.floor((Date.now() - new Date(state.lastMaintenanceAtIso).getTime()) / (1000 * 3600 * 24))
    : null

  function showStatus(msg: string, tone: 'success' | 'warning' = 'warning') {
    setStatus(msg)
    setStatusTone(tone)
  }

  const tabShortLabel = useMemo<Record<TabId, string>>(() => ({
    'Overview / Health Dashboard': t('tabs.overviewShort'),
    'System Cleanup': t('tabs.cleanupShort'),
    'Data & Profiles': t('tabs.dataShort'),
    'Logs & History': t('tabs.logsShort'),
    'Scheduled / Automation': t('tabs.scheduleShort'),
  }), [t])

  const tabFullLabel = useMemo<Record<TabId, string>>(() => ({
    'Overview / Health Dashboard': t('tabs.overview'),
    'System Cleanup': t('tabs.cleanup'),
    'Data & Profiles': t('tabs.data'),
    'Logs & History': t('tabs.logs'),
    'Scheduled / Automation': t('tabs.schedule'),
  }), [t])

  async function appendHistory(action: string, result: 'success' | 'warning' | 'failed', note?: string, reclaimedMb?: number): Promise<void> {
    const next = {
      ...state,
      lastMaintenanceAtIso: new Date().toISOString(),
      history: [
        { id: crypto.randomUUID(), atIso: new Date().toISOString(), action, result, note, reclaimedMb },
        ...(state.history ?? []),
      ].slice(0, 200),
    }
    await saveState(next)
  }

  async function checkProfileHealth(profile: ComposeProfile): Promise<void> {
    try {
      const logsRes = await window.dh.composeLogs({ profile })
      const logs = (logsRes.ok ? logsRes.log : logsRes.error || '').toLowerCase()
      const hasErrors = /error|failed|fatal/.test(logs)
      const health: MaintenanceProfileHealth['health'] = hasErrors ? 'degraded' : logs.trim().length === 0 ? 'unknown' : 'healthy'
      const nextEntry: MaintenanceProfileHealth = {
        profile,
        health,
        lastCheckedAtIso: new Date().toISOString(),
        lastRunAtIso: health === 'healthy' ? new Date().toISOString() : undefined,
        note: hasErrors ? t('compose.errorMarkers') : t('compose.inspected'),
      }
      const next = { ...state, profileHealth: [nextEntry, ...state.profileHealth.filter((x) => x.profile !== profile)].slice(0, 40) }
      await saveState(next)
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function checkAllProfiles(): Promise<void> {
    for (const profile of profileIds) {
      // Sequential on purpose to avoid parallel docker compose pressure.
      await checkProfileHealth(profile)
    }
  }

  async function runProfile(profile: ComposeProfile): Promise<void> {
    try {
      const res = await window.dh.composeUp({ profile })
      const nextEntry: MaintenanceProfileHealth = {
        profile,
        health: res.ok ? 'healthy' : 'degraded',
        lastCheckedAtIso: new Date().toISOString(),
        lastRunAtIso: new Date().toISOString(),
        note: res.ok
          ? t('compose.upSuccess')
          : (humanizeDockerError(res.error || res.log || t('compose.upError'))).slice(0, 280),
      }
      const next = { ...state, profileHealth: [nextEntry, ...state.profileHealth.filter((x) => x.profile !== profile)].slice(0, 40) }
      await saveState(next)
      await refreshLive()
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function runCleanup(): Promise<void> {
    setBusyCleanup(true)
    try {
      const res = (await window.dh.dockerCleanupRun(DEFAULT_DOCKER_CLEANUP_SELECTION)) as {
        ok: boolean
        reclaimedBytes?: number
        error?: string
      }
      if (!res.ok) {
        throw new Error(humanizeDockerError(res.error))
      }
      const mb = Math.round((((res.reclaimedBytes ?? 0) / (1024 * 1024)) * 10)) / 10
      showStatus(`Cleanup finished. Reclaimed ~${mb} MB.`, 'success')
      await appendHistory('docker.cleanup', 'success', t('cleanup.dockerExecuted'), mb)
      await refreshLive()
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e))
      await appendHistory('docker.cleanup', 'failed', e instanceof Error ? e.message : String(e))
    } finally {
      setBusyCleanup(false)
    }
  }

  async function runRecommendedMaintenance(): Promise<void> {
    if (recommendedSelection.pruneDocker) {
      await runCleanup()
    }
    if (recommendedSelection.clearCache) {
      await appendHistory('cache.cleanup.manual', 'warning', t('cleanup.hostCache'))
    }
    if (recommendedSelection.cleanLogs) {
      await appendHistory('logs.cleanup.manual', 'warning', t('cleanup.logCleanup'))
    }
    showStatus(t('page.recommendedDone'), 'success')
  }

  async function saveReminder(days: number): Promise<void> {
    await saveState({ ...state, reminderDays: days })
    if (Notification.permission === 'granted') {
      new Notification(t('runbook.notificationTitle'), { body: t('runbook.notificationBody', { days }) })
    }
  }

  async function addTask(): Promise<void> {
    const title = newTaskTitle.trim()
    if (!title) return
    const task: MaintenanceTask = {
      id: crypto.randomUUID(),
      title,
      done: false,
      cronHint: newCron.trim() || undefined,
      commandHint: newCmd.trim() || undefined,
      updatedAtIso: new Date().toISOString(),
    }
    await saveState({ ...state, tasks: [task, ...state.tasks].slice(0, 100) })
    setNewTaskTitle('')
    setNewCron('')
    setNewCmd('')
  }

  async function updateTask(taskId: string, patch: Partial<MaintenanceTask>): Promise<void> {
    const next = {
      ...state,
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, updatedAtIso: new Date().toISOString() } : t)),
    }
    await saveState(next)
  }

  async function removeTask(taskId: string): Promise<void> {
    await saveState({ ...state, tasks: state.tasks.filter((t) => t.id !== taskId) })
  }

  const runHostProbe = useCallback(async (op: RunbookOp) => {
    setRunbookBusyId(op.id)
    setCommandPeek(null)
    try {
      const res = (await window.dh.hostExec({ command: op.probe })) as {
        ok: boolean
        result?: unknown
        error?: string
      }
      const text = res.ok
        ? (typeof res.result === 'string' ? res.result : JSON.stringify(res.result ?? '')) || '(empty)'
        : res.error ?? t('cleanup.requestFailed')
      setRunbook({ title: op.label, text })
    } catch (e) {
      setRunbook({ title: op.label, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunbookBusyId(null)
    }
  }, [t])

  async function runDiagnosticsWizard(): Promise<void> {
    setRunningDiagnostics(true)
    try {
      const checks: DiagnosticCheck[] = []
      const docker = (await window.dh.dockerCheckInstalled()) as { docker: boolean; compose: boolean; buildx: boolean }
      checks.push({
        id: 'docker',
        label: t('check.docker'),
        ok: docker.docker && docker.compose,
        details: `docker=${docker.docker} compose=${docker.compose} buildx=${docker.buildx}`,
      })

      const hostSecRes = await window.dh.monitorSecurity()
      const hostSec = hostSecRes.ok ? hostSecRes.snapshot : null
      const firewallOk = hostSec?.firewall === 'active'
      const sshPasswordOk = hostSec?.sshPasswordAuth !== 'yes'
      checks.push({
        id: 'security',
        label: t('check.security'),
        ok: Boolean(hostSec && firewallOk && sshPasswordOk),
        severity: !hostSec
          ? 'fail'
          : firewallOk && !sshPasswordOk
            ? 'warn'
            : firewallOk && sshPasswordOk
              ? 'pass'
              : 'fail',
        details: hostSec
          ? `firewall=${hostSec.firewall}, sshPasswordAuth=${hostSec.sshPasswordAuth}`
          : hostSecRes.error || t('check.securityUnavailable'),
      })

      const gitHost = (await window.dh.gitConfigList({ target: 'host' })) as {
        ok: boolean
        rows: Array<{ key: string; value: string }>
        error?: string
      }
      const rows = gitHost.ok ? (gitHost.rows ?? []) : []
      const hasName = rows.some((r) => r.key.toLowerCase() === 'user.name')
      const hasEmail = rows.some((r) => r.key.toLowerCase() === 'user.email')
      checks.push({
        id: 'git',
        label: t('check.git'),
        ok: hasName && hasEmail,
        details: gitHost.ok ? t('check.gitDetail', { name: String(hasName), email: String(hasEmail) }) : gitHost.error || t('check.gitUnavailable'),
      })

      const sshHost = await window.dh.sshGetPub({ target: 'host' })
      checks.push({
        id: 'ssh',
        label: t('check.ssh'),
        ok: Boolean(sshHost.ok && sshHost.pub),
        details: sshHost.ok && sshHost.fingerprint ? t('check.sshDetail', { fp: sshHost.fingerprint }) : t('check.sshNone'),
      })

      const rt = await window.dh.runtimeStatus()
      const critical = ['node', 'python', 'rust']
      const installedCount = rt.ok
        ? critical.filter((id) => rt.runtimes.some((r) => r.id === id && r.installed)).length
        : 0
      checks.push({
        id: 'runtimes',
        label: t('check.runtimes'),
        ok: installedCount >= 2,
        details: rt.ok ? `${installedCount}/3 core runtimes installed` : humanizeRuntimeError(rt.error),
      })

      const perf = await window.dh.perfSnapshot()
      const snap = perf.ok ? (perf.snapshot as PerfSnapshot | undefined) : undefined
      checks.push({
        id: 'perf',
        label: t('check.perf'),
        ok: Boolean(snap && snap.rssMb < 900),
        details: snap
          ? `rss=${snap.rssMb}MB uptime=${snap.uptimeSec}s`
          : perf.error || t('check.perfUnavailable'),
      })

      const a11ySnapshot = collectAccessibilitySnapshot(document)
      const a11y = evaluateAccessibilitySnapshot(a11ySnapshot)
      checks.push({
        id: 'a11y',
        label: t('check.a11y'),
        ok: a11y.ok,
        details: a11y.details,
      })

      setDiagnostics(checks)
      const failed = checks.filter((c) => !c.ok).length
      await appendHistory('diagnostics.run', failed === 0 ? 'success' : 'warning', t('health.someIssues', { count: failed, total: checks.length }))
      showStatus(failed === 0 ? t('health.passed') : t('health.failed', { count: failed }), failed === 0 ? 'success' : 'warning')
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e))
      await appendHistory('diagnostics.run', 'failed', e instanceof Error ? e.message : String(e))
    } finally {
      setRunningDiagnostics(false)
    }
  }

  async function exportDiagnosticReport(): Promise<void> {
    const payload = {
      generatedAt: new Date().toISOString(),
      summary: {
        guardianScore: guardian.score,
        degradedProfiles,
        riskyPorts: security?.riskyOpenPorts.length ?? 0,
      },
      diagnostics,
      serviceState,
      profileHealth: state.profileHealth,
      recentHistory: (state.history ?? []).slice(0, 50),
      recentJobs: jobs.slice(0, 50),
    }
    const res = (await window.dh.diagnosticsBundleCreate({
      report: payload,
      includeSensitive: includeSensitiveBundle,
    })) as { ok: boolean; path?: string; error?: string }
    if (!res.ok) {
      throw new Error(res.error ?? 'bundle generation failed')
    }
    showStatus(t('health.exported', { path: res.path ?? 'Downloads/LuminaDev', mode: includeSensitiveBundle ? t('health.exportFull') : t('health.exportRedacted') }), 'success')
    await appendHistory('diagnostics.export', 'success', `Support bundle exported (${includeSensitiveBundle ? t('health.exportIncludeSensitive') : t('health.exportRedacted')}).`)
  }

  return {
    t,
    activeTab,
    setActiveTab,
    metrics,
    containers,
    security,
    topProcesses,
    jobs,
    state,
    serviceState,
    recommendedSelection,
    setRecommendedSelection,
    newTaskTitle,
    setNewTaskTitle,
    newCron,
    setNewCron,
    newCmd,
    setNewCmd,
    savingState,
    busyCleanup,
    runningDiagnostics,
    diagnostics,
    includeSensitiveBundle,
    setIncludeSensitiveBundle,
    status,
    setStatus,
    statusTone,
    runbook,
    setRunbook,
    runbookBusyId,
    systemdBusy,
    systemdError,
    commandPeek,
    setCommandPeek,
    editTaskId,
    setEditTaskId,
    editDraft,
    setEditDraft,
    m,
    runningContainers,
    guardian,
    guardianOverallLevel,
    onGuardianLayerAction,
    memPct,
    diskPct,
    activeJobCount,
    pendingTasks,
    degradedProfiles,
    lastMaintenanceDaysAgo,
    showStatus,
    tabShortLabel,
    tabFullLabel,
    saveState,
    refreshLive,
    refreshSystemdSnapshot,
    startSystemdService,
    checkProfileHealth,
    checkAllProfiles,
    runProfile,
    runRecommendedMaintenance,
    saveReminder,
    addTask,
    updateTask,
    removeTask,
    runHostProbe,
    runDiagnosticsWizard,
    exportDiagnosticReport,
  }
}
