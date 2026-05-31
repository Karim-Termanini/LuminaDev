import { ComposeProfileSchema, type ComposeProfile, type ContainerRow, type HostMetricsResponse, type HostSecuritySnapshot, type JobSummary, type MaintenanceProfileHealth, type MaintenanceStateStore, type MaintenanceTask, type TopProcessRow, type PerfSnapshot } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { humanizeDashboardError } from './dashboardError'
import { humanizeDockerError } from './dockerError'
import { humanizeRuntimeError } from './runtimeError'
import { collectAccessibilitySnapshot, evaluateAccessibilitySnapshot } from './accessibilityAudit'
import { evaluateGuardian } from './maintenanceGuardian'
import {
  getGuardianLayerPressureScore,
  getGuardianLayerTooltip,
  getMaintenanceOverallLabel,
  getMaintenanceOverallLevel,
  getMaintenancePressureColor,
  getMaintenancePressureDescription,
  getMaintenancePressureLabel,
  getMaintenancePressureLevel,
} from './maintenanceHealth'
import { humanizeMaintenanceDiagnostic } from './maintenanceDiagnosticsHumanize'
import {
  MAINTENANCE_CRON_PRESETS,
  OPS_RUNBOOK,
} from './maintenancePageHelpers'
import {
  isUnitNotFoundError,
  MAINTENANCE_SYSTEMD_SERVICES,
  normalizeSystemdState,
  type SystemdServiceId,
  type SystemdServiceState,
} from './maintenanceSystemdServices'
import './MaintenancePage.css'

const STATUS_AUTO_DISMISS_MS = 12_000
const profileIds = ComposeProfileSchema.options
const TABS = [
  'Overview / Health Dashboard',
  'System Cleanup',
  'Data & Profiles',
  'Logs & History',
  'Scheduled / Automation',
] as const

const DEFAULT_DOCKER_CLEANUP_SELECTION = {
  containers: true,
  images: true,
  volumes: false,
  networks: false,
} as const

type ServiceState = Record<SystemdServiceId, import('./maintenanceSystemdServices').SystemdServiceState>
type TabId = (typeof TABS)[number]
type DiagnosticCheck = { id: string; label: string; ok: boolean; details: string }

type RunbookOp = (typeof OPS_RUNBOOK)[number]

const MAINT_TAB_META: Record<TabId, { icon: string; short: string }> = {
  'Overview / Health Dashboard': { icon: 'dashboard', short: 'Overview' },
  'System Cleanup': { icon: 'trash', short: 'Cleanup' },
  'Data & Profiles': { icon: 'folder', short: 'Data' },
  'Logs & History': { icon: 'history', short: 'Logs' },
  'Scheduled / Automation': { icon: 'watch', short: 'Schedule' },
}

const OVERVIEW_NAV: Array<{ tab: TabId; icon: string; titleKey: string; descKey: string }> = [
  { tab: 'System Cleanup', icon: 'trash', titleKey: 'overview.nav.cleanup', descKey: 'overview.nav.cleanupDesc' },
  { tab: 'Data & Profiles', icon: 'folder', titleKey: 'overview.nav.data', descKey: 'overview.nav.dataDesc' },
  { tab: 'Logs & History', icon: 'history', titleKey: 'overview.nav.logs', descKey: 'overview.nav.logsDesc' },
  { tab: 'Scheduled / Automation', icon: 'watch', titleKey: 'overview.nav.schedule', descKey: 'overview.nav.scheduleDesc' },
]

const GUARDIAN_LAYER_LABELS: Record<string, string> = {
  host_compute: 'guardian.hostCompute',
  memory_pressure: 'guardian.memoryPressure',
  storage_pressure: 'guardian.storagePressure',
  container_fleet: 'guardian.containerFleet',
  process_health: 'guardian.processHealth',
  host_security: 'guardian.hostSecurity',
}

const GUARDIAN_LAYER_META: Record<string, { icon: string; tone: string }> = {
  host_compute: { icon: 'pulse', tone: 'compute' },
  memory_pressure: { icon: 'chip', tone: 'memory' },
  storage_pressure: { icon: 'save', tone: 'storage' },
  container_fleet: { icon: 'package', tone: 'docker' },
  process_health: { icon: 'server-process', tone: 'process' },
  host_security: { icon: 'shield', tone: 'security' },
}

function GuardianLayerTile({
  layerId,
  title,
  signals,
  detail,
  deduction,
  ok,
  pressureScore,
}: {
  layerId: string
  title: string
  signals: string
  detail: string
  deduction: number
  ok: boolean
  pressureScore: number | null
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const level = getMaintenancePressureLevel(pressureScore)
  const tooltip = getGuardianLayerTooltip(layerId as Parameters<typeof getGuardianLayerTooltip>[0], t)
  const meta = GUARDIAN_LAYER_META[layerId] ?? { icon: 'info', tone: 'default' }

  return (
    <div
      className={`maint-layer-tile maint-tone-${meta.tone} ${ok ? 'maint-layer-tile--ok' : 'maint-layer-tile--warn'}`}
      title={tooltip}
    >
      <div className="maint-layer-tile-bar" aria-hidden />
      <div className="maint-layer-head">
        <div className="maint-layer-title-row">
          <span className={`maint-layer-icon-wrap maint-tone-${meta.tone}`} aria-hidden>
            <span className={`codicon codicon-${meta.icon}`} />
          </span>
          <div className="maint-layer-title" title={tooltip}>
            {title}
          </div>
        </div>
        {pressureScore != null ? (
          <div className="maint-layer-score-row">
            <span className="maint-layer-score-num">{Math.round(pressureScore)}/100</span>
            {level ? (
              <span className={`maint-layer-status is-${level}`}>
                <span className="maint-layer-status-dot" style={{ background: getMaintenancePressureColor(level) }} aria-hidden />
                {getMaintenancePressureLabel(level, t)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="hp-muted maint-layer-waiting">{t('layerPressure.waiting')}</span>
        )}
      </div>

      {pressureScore != null && level ? (
        <>
          <div className="maint-layer-bar" aria-hidden>
            <div
              className={`maint-layer-bar-fill is-${level}`}
              style={{ width: `${Math.round(pressureScore)}%` }}
            />
          </div>
          <p className={`maint-layer-hint is-${level}`} role="status">
            {getMaintenancePressureDescription(level, t)}
          </p>
        </>
      ) : null}

      <div className="hp-muted maint-layer-signals">{signals}</div>
      <div className="maint-layer-detail">{detail}</div>
      <div className={`maint-layer-deduction ${deduction > 0 ? 'is-warn' : 'is-ok'}`}>
        {deduction > 0 ? `−${deduction} pts` : '−0 pts'}
      </div>
    </div>
  )
}

function MaintenanceRunbookStrip({
  runbookBusyId,
  onRun,
}: {
  runbookBusyId: string | null
  onRun: (op: RunbookOp) => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  return (
    <>
      <div className="maint-runbook-label">{t('runbook.label')}</div>
      <p className="maint-section-lead maint-runbook-lead">{t('runbook.lead')}</p>
      <div className="maint-runbook-grid">
        {OPS_RUNBOOK.map((op) => (
          <button
            key={op.id}
            type="button"
            className="maint-runbook-tile"
            disabled={runbookBusyId !== null}
            onClick={() => void onRun(op)}
          >
            <span className={`codicon codicon-${op.icon}`} aria-hidden />
            <span className="maint-runbook-tile-copy">
              <strong>{runbookBusyId === op.id ? t('runbook.running') : t(op.labelKey)}</strong>
              <span className="hp-muted">{t(op.descKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function SystemdServiceTile({
  serviceId,
  state,
  busy,
  error,
  optional,
  onStart,
}: {
  serviceId: SystemdServiceId
  state: SystemdServiceState
  busy: boolean
  error?: string
  optional: boolean
  onStart: () => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const def = MAINTENANCE_SYSTEMD_SERVICES.find((s) => s.id === serviceId)
  if (!def) return <></>

  const showStart = state === 'inactive' || state === 'unknown'
  const notInstalled = state === 'not_installed'

  return (
    <div className={`maint-systemd-tile is-${state}`}>
      <div className="maint-systemd-head">
        <span className={`maint-systemd-icon codicon codicon-${def.icon}`} aria-hidden />
        <div className="maint-systemd-copy">
          <strong>{t(def.titleKey)}</strong>
          <span className="hp-muted">{t(def.descKey)}</span>
        </div>
        <StatusPill state={notInstalled ? 'not_installed' : state} />
      </div>
      {error && !notInstalled ? <div className="maint-systemd-error">{error}</div> : null}
      {notInstalled ? (
        <div className="maint-systemd-ok hp-muted">
          {optional ? t('systemd.notInstalledOptional') : t('systemd.notInstalled')}
        </div>
      ) : showStart ? (
        <button type="button" className="hp-btn hp-btn-primary maint-systemd-start" disabled={busy} onClick={onStart}>
          <span className="codicon codicon-play" aria-hidden />
          {busy ? t('systemd.starting') : t('systemd.start')}
        </button>
      ) : (
        <div className="maint-systemd-ok hp-muted">{t('systemd.running')}</div>
      )}
    </div>
  )
}

function OverviewNav({
  onOpenTab,
}: {
  onOpenTab: (tab: TabId) => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  return (
    <div className="maint-overview-nav">
      <div className="maint-section-head">{t('overview.navTitle')}</div>
      <p className="maint-section-lead">{t('overview.navLead')}</p>
      <div className="maint-overview-nav-grid">
        {OVERVIEW_NAV.map((item) => (
          <button key={item.tab} type="button" className="maint-overview-nav-card" onClick={() => onOpenTab(item.tab)}>
            <span className={`codicon codicon-${item.icon}`} aria-hidden />
            <span className="maint-overview-nav-copy">
              <strong>{t(item.titleKey)}</strong>
              <span className="hp-muted">{t(item.descKey)}</span>
            </span>
            <span className="codicon codicon-chevron-right maint-overview-nav-chevron" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

function DiagnosticResultRow({
  check,
  onRerun,
  rerunning,
}: {
  check: DiagnosticCheck
  onRerun: () => void
  rerunning: boolean
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const human = humanizeMaintenanceDiagnostic(check, t)

  return (
    <div className={`maint-diag-row ${check.ok ? 'maint-diag-row--pass' : 'maint-diag-row--fail'}`}>
      <div className="maint-diag-main">
        <strong className="maint-diag-title">{check.label}</strong>
        <p className="maint-diag-summary">{human.summary}</p>
        <p className="maint-diag-hint">{human.hint}</p>
        <details className="maint-diag-tech">
          <summary>{t('diag.showTechnical')}</summary>
          <code>{human.technical}</code>
        </details>
      </div>
      <div className="maint-diag-actions">
        <StatusPill state={check.ok ? 'success' : 'failed'} />
        {!check.ok && human.action ? (
          <Link to={human.action.href} className="hp-btn maint-diag-action-btn">
            {t(human.action.labelKey)}
          </Link>
        ) : null}
        {check.id === 'docker' && !check.ok ? (
          <button type="button" className="hp-btn" disabled={rerunning} onClick={onRerun}>
            {rerunning ? t('health.running') : t('diag.rerun')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function MaintenancePage(): ReactElement {
  const { t } = useTranslation('maintenance')
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
      checks.push({
        id: 'security',
        label: t('check.security'),
        ok: Boolean(hostSec && hostSec.firewall === 'active' && hostSec.sshPasswordAuth !== 'yes'),
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

  return (
    <div className="maint-page elevated-page">
      <div className="maint-scroll">
      <header className="maint-hero">
        <div className="maint-hero-eyebrow">
          <span className="codicon codicon-tools" aria-hidden />
          {t('page.eyebrow')}
        </div>
        <div className="maint-hero-row">
          <div>
            <h1 className="maint-hero-title">{t('page.contentTitle')}</h1>
            <p className="maint-hero-sub">
              {degradedProfiles > 0 ? t('page.statusIssues', { count: degradedProfiles }) : t('page.statusHealthy')}{' '}
              {lastMaintenanceDaysAgo === null ? t('page.lastMaintenanceNever') : t('page.lastMaintenance', { days: lastMaintenanceDaysAgo })}
            </p>
          </div>
          <div className="maint-live-pill" role="status">
            <span className="maint-live-dot" aria-hidden />
            {t('page.live')}
          </div>
        </div>
      </header>

      <section className="maint-spotlight" aria-label={t('summary.aria')}>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.guardian')}</span>
          <span className={`maint-spotlight-value${guardian.score != null && guardian.score >= 70 ? ' is-ok' : guardian.score != null ? ' is-warn' : ''}`}>
            {guardian.score === null ? '—' : `${guardian.score}%`}
          </span>
          <span className="maint-spotlight-sub">
            {guardian.score != null ? getMaintenanceOverallLabel(guardianOverallLevel, t) : t('summary.guardian_sub')}
          </span>
        </div>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.cpu')}</span>
          <span className={`maint-spotlight-value${m && m.cpuUsagePercent >= 85 ? ' is-warn' : ''}`}>
            {m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'}
          </span>
          <span className="maint-spotlight-sub">{t('summary.cpu_sub')}</span>
        </div>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.memory')}</span>
          <span className={`maint-spotlight-value${memPct != null && memPct >= 90 ? ' is-warn' : ''}`}>
            {memPct != null ? `${memPct}%` : '—'}
          </span>
          <span className="maint-spotlight-sub">{t('summary.memory_sub')}</span>
        </div>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.docker')}</span>
          <span className="maint-spotlight-value">{runningContainers}/{containers.length}</span>
          <span className="maint-spotlight-sub">{t('summary.docker_sub')}</span>
        </div>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.tasks')}</span>
          <span className={`maint-spotlight-value${pendingTasks.length > 0 ? ' is-warn' : ''}`}>{pendingTasks.length}</span>
          <span className="maint-spotlight-sub">{t('summary.tasks_sub')}</span>
        </div>
        <div className="maint-spotlight-item">
          <span className="maint-spotlight-label">{t('summary.disk')}</span>
          <span className={`maint-spotlight-value${diskPct != null && diskPct >= 92 ? ' is-warn' : ''}`}>
            {diskPct != null ? `${diskPct}%` : '—'}
          </span>
          <span className="maint-spotlight-sub">{t('summary.disk_sub')}</span>
        </div>
      </section>

      <nav className="maint-tabs" aria-label="Maintenance sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`maint-tab ${activeTab === tab ? 'maint-tab-active' : ''}`}
            title={tabFullLabel[tab]}
            onClick={() => setActiveTab(tab)}
          >
            <span className={`codicon codicon-${MAINT_TAB_META[tab].icon}`} aria-hidden />
            <span>{tabShortLabel[tab]}</span>
            <span className="maint-tab-full">{tabFullLabel[tab]}</span>
          </button>
        ))}
      </nav>

      {activeTab === 'Overview / Health Dashboard' ? (
      <section className="maint-panel">
        {activeJobCount > 0 ? (
          <div className="maint-job-banner">
            <span className="maint-job-banner-text">
              <strong>{activeJobCount}</strong> job{activeJobCount === 1 ? '' : 's'} running (install, diagnostics, etc.).
            </span>
            <button
              type="button"
              className="hp-btn hp-btn-primary maint-job-banner-btn"
              onClick={() => setActiveTab('Logs & History')}
            >
              {t('page.viewJobRunner')}
            </button>
          </div>
        ) : null}
        <div className="maint-guardian-card maint-guardian-card--solo">
          <div className="maint-guardian-card-bar" aria-hidden />
          <div className="maint-section-head">{t('section.systemOverview')}</div>
          <div className="maint-score-hero">
            <div className="maint-score-ring" aria-hidden>
              <svg viewBox="0 0 120 120" className="maint-score-ring-svg">
                <circle className="maint-score-ring-track" cx="60" cy="60" r="52" />
                <circle
                  className={`maint-score-ring-fill is-${guardianOverallLevel}`}
                  cx="60"
                  cy="60"
                  r="52"
                  strokeDasharray={`${((guardian.score ?? 0) / 100) * 326.7} 326.7`}
                />
              </svg>
              <div className="maint-score-ring-label">
                {guardian.score === null ? '—' : `${guardian.score}%`}
              </div>
            </div>
            <div className="maint-score-copy">
              <div className="maint-score-sub">{t('health.guardianHealth')}</div>
              {guardian.score != null ? (
                <span className={`maint-overall-badge is-${guardianOverallLevel}`}>
                  <span className="maint-overall-dot" aria-hidden />
                  {getMaintenanceOverallLabel(guardianOverallLevel, t)}
                </span>
              ) : null}
              <p className="maint-real-data-note">{t('overview.realDataNote')}</p>
              <div className="maint-kpi-row">
                <span className="maint-kpi">CPU {m?.cpuUsagePercent.toFixed(1) ?? '—'}%</span>
                <span className="maint-kpi">Mem {memPct ?? '—'}%</span>
                <span className="maint-kpi">Disk {diskPct ?? '—'}%</span>
                <span className="maint-kpi">Docker {runningContainers}/{containers.length}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="maint-divider">
          <div className="maint-section-head">{t('section.guardianLayers')}</div>
          <p className="maint-section-lead">
            <Trans i18nKey="guardian.description" ns="maintenance" t={t} components={{ 0: <strong /> }} />
          </p>
          <div className="maint-layer-grid">
            {guardian.layers.map((layer) => (
              <GuardianLayerTile
                key={layer.id}
                layerId={layer.id}
                title={t(GUARDIAN_LAYER_LABELS[layer.id] ?? layer.title)}
                signals={layer.signals}
                detail={layer.detail}
                deduction={layer.deduction}
                ok={layer.ok}
                pressureScore={getGuardianLayerPressureScore(layer.id, m, containers, topProcesses, security)}
              />
            ))}
          </div>
          <div className="maint-checklist-block">
            <div className="maint-section-head">{t('section.yourChecklist')}</div>
            <p className="maint-section-lead">{t('overview.checklistLead')}</p>
            {pendingTasks.length === 0 ? (
              <div className="hp-muted maint-checklist-empty">{t('checklist.noTasks')}</div>
            ) : (
              <ul className="maint-checklist">
                {pendingTasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="maint-checklist-item">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => void updateTask(task.id, { done: !task.done })}
                      aria-label={`Done: ${task.title}`}
                    />
                    <span>{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="hp-btn maint-checklist-btn"
              onClick={() => setActiveTab('Scheduled / Automation')}
            >
              {t('checklist.openSchedule')}
            </button>
          </div>
          <OverviewNav onOpenTab={setActiveTab} />
        </div>
      </section>
      ) : null}

      {activeTab === 'System Cleanup' ? (
      <section className="maint-panel">
        <div className="maint-section-head">{t('section.runRecommended')}</div>
        <p className="maint-section-lead">{t('cleanup.lead')}</p>
        <div className="maint-actions-body">
          <label className="maint-check-row"><input type="checkbox" checked={recommendedSelection.clearCache} onChange={(e) => setRecommendedSelection((p) => ({ ...p, clearCache: e.target.checked }))} /> {t('section.clearCache')}</label>
          <label className="maint-check-row"><input type="checkbox" checked={recommendedSelection.pruneDocker} onChange={(e) => setRecommendedSelection((p) => ({ ...p, pruneDocker: e.target.checked }))} /> {t('section.pruneDocker')}</label>
          <label className="maint-check-row"><input type="checkbox" checked={recommendedSelection.cleanLogs} onChange={(e) => setRecommendedSelection((p) => ({ ...p, cleanLogs: e.target.checked }))} /> {t('section.cleanLogs')}</label>
          <button className="hp-btn hp-btn-primary maint-actions-run" onClick={() => void runRecommendedMaintenance()} disabled={busyCleanup || savingState}>
            <span className="codicon codicon-play" aria-hidden />
            {t('section.runQuick')}
          </button>
        </div>
        <p className="maint-section-lead maint-docker-page-hint">
          {t('cleanup.dockerPageHint')}{' '}
          <Link to="/docker">{t('cleanup.openDocker')}</Link>
        </p>
      </section>
      ) : null}

      {activeTab === 'Data & Profiles' ? (
      <section className="maint-panel">
        <div className="maint-section-head">{t('section.infrastructureStatus')}</div>
        <p className="maint-section-lead">{t('infra.lead')}</p>
        <div className="hp-row-wrap maint-infra-toolbar">
          <button className="hp-btn" onClick={() => void checkAllProfiles()} disabled={savingState}>{t('infra.checkAllProfiles')}</button>
          <button className="hp-btn" onClick={() => void refreshSystemdSnapshot()} disabled={savingState}>{t('infra.refreshSystemd')}</button>
        </div>
        <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">{t('infra.profile')}</th>
                <th className="hp-table-cell">{t('infra.health')}</th>
                <th className="hp-table-cell">{t('infra.lastChecked')}</th>
                <th className="hp-table-cell">{t('infra.lastRun')}</th>
                <th className="hp-table-cell">{t('infra.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {profileIds.map((profile) => {
                const entry = state.profileHealth.find((p) => p.profile === profile)
                return (
                  <tr key={profile} className="hp-table-row">
                    <td className="hp-table-cell">{profile}</td>
                    <td className="hp-table-cell"><StatusPill state={entry?.health ?? 'unknown'} /></td>
                    <td className="hp-table-cell mono">{entry?.lastCheckedAtIso ?? '-'}</td>
                    <td className="hp-table-cell mono">{entry?.lastRunAtIso ?? '-'}</td>
                    <td className="hp-table-cell">
                      <div className="hp-row-wrap">
                        <button className="hp-btn" onClick={() => void checkProfileHealth(profile)} disabled={savingState}>{t('infra.check')}</button>
                        <button className="hp-btn" onClick={() => void runProfile(profile)} disabled={savingState}>{t('infra.run')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="maint-section-head maint-section-head-spaced">{t('infra.systemServices')}</div>
        <p className="maint-section-lead">{t('infra.systemServicesLead')}</p>
        <div className="maint-systemd-grid">
          {MAINTENANCE_SYSTEMD_SERVICES.map((svc) => (
            <SystemdServiceTile
              key={svc.id}
              serviceId={svc.id}
              state={serviceState[svc.id] ?? 'unknown'}
              busy={Boolean(systemdBusy[svc.id])}
              error={systemdError[svc.id]}
              optional={svc.optional}
              onStart={() => void startSystemdService(svc.id)}
            />
          ))}
        </div>
      </section>
      ) : null}

      {activeTab === 'Scheduled / Automation' ? (
      <section className="maint-panel">
        <div className="maint-section-head">{t('section.maintenanceTasksRunbook')}</div>
        <p className="maint-section-lead">{t('tasks.lead')}</p>
        <div className="maint-task-form">
          <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="hp-input" placeholder={t('tasks.titlePlaceholder')} />
          <div className="hp-grid-2">
            <input value={newCron} onChange={(e) => setNewCron(e.target.value)} className="hp-input" placeholder={t('tasks.cronPlaceholder')} />
            <input value={newCmd} onChange={(e) => setNewCmd(e.target.value)} className="hp-input" placeholder={t('tasks.commandPlaceholder')} />
          </div>
          <div className="maint-cron-presets">
            <span className="maint-cron-presets-label">{t('tasks.cronPresets')}</span>
            {MAINTENANCE_CRON_PRESETS.map((preset) => (
              <button
                key={preset.cron}
                type="button"
                className="maint-cron-preset"
                title={t(preset.descKey)}
                onClick={() => setNewCron(preset.cron)}
                disabled={savingState}
              >
                <strong>{t(preset.labelKey)}</strong>
                <span className="hp-muted">{preset.cron}</span>
              </button>
            ))}
          </div>
          <button className="hp-btn hp-btn-primary" onClick={() => void addTask()} disabled={savingState || !newTaskTitle.trim()}>{t('tasks.add')}</button>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {state.tasks.length === 0 ? (
            <div className="hp-muted">{t('tasks.noTasks')}</div>
          ) : (
            state.tasks.map((task) => (
              <div key={task.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div className="hp-row-wrap" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => void updateTask(task.id, { done: !task.done })}
                      aria-label={task.done ? 'Mark not done' : 'Mark done'}
                    />
                    {editTaskId === task.id ? (
                      <input
                        className="hp-input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => {
                          void (async () => {
                            const t = editDraft.trim()
                            if (t) await updateTask(task.id, { title: t })
                            setEditTaskId(null)
                          })()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') {
                            setEditTaskId(null)
                            setEditDraft('')
                          }
                        }}
                        autoFocus
                        aria-label="Edit task title"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditTaskId(task.id)
                          setEditDraft(task.title)
                        }}
                        className="hp-btn"
                        style={{
                          textAlign: 'left',
                          textDecoration: task.done ? 'line-through' : 'none',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          font: 'inherit',
                          flex: 1,
                          minWidth: 0,
                        }}
                        title="Rename task"
                      >
                        {task.title}
                      </button>
                    )}
                  </div>
                  <button className="hp-btn hp-btn-danger" onClick={() => void removeTask(task.id)}>{t('tasks.delete')}</button>
                </div>
                {task.cronHint ? <div className="mono hp-muted" style={{ fontSize: 11, marginTop: 6 }}>cron: {task.cronHint}</div> : null}
                {task.commandHint ? (
                  <div className="hp-row-wrap" style={{ marginTop: 6 }}>
                    <button type="button" className="hp-btn" onClick={() => setCommandPeek(task.commandHint ?? '')}>
                      {t('tasks.viewCommandHint')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <MaintenanceRunbookStrip runbookBusyId={runbookBusyId} onRun={runHostProbe} />
        <div className="maint-divider">
          <div className="maint-section-head">{t('schedule.remindersTitle')}</div>
          <p className="maint-section-lead">{t('schedule.remindersLead')}</p>
          <div className="hp-row-wrap">
            <button className="hp-btn" onClick={() => void saveReminder(3)}>{t('schedule.reminder3d')}</button>
            <button className="hp-btn" onClick={() => void saveReminder(7)}>{t('schedule.reminder7d')}</button>
            <button className="hp-btn" onClick={() => void saveReminder(14)}>{t('schedule.reminder14d')}</button>
            <span className="hp-muted">{t('schedule.currentReminder', { days: state.reminderDays ?? 'none' })}</span>
          </div>
        </div>
      </section>
      ) : null}

      {activeTab === 'Logs & History' ? (
      <section className="maint-panel" id="maintenance-job-runner">
        <div className="hp-section-title">{t('section.jobRunner')}</div>
        <p className="hp-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
          {t('jobs.description')}
        </p>
        <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">{t('jobs.kind')}</th>
                <th className="hp-table-cell">{t('jobs.state')}</th>
                <th className="hp-table-cell">{t('jobs.progress')}</th>
                <th className="hp-table-cell">{t('jobs.tail')}</th>
                <th className="hp-table-cell">{t('jobs.action')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td className="hp-table-cell hp-muted" colSpan={5}>{t('jobs.noJobs')}</td></tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hp-table-row">
                    <td className="hp-table-cell mono">{j.kind}</td>
                    <td className="hp-table-cell"><StatusPill state={j.state} /></td>
                    <td className="hp-table-cell mono">{j.progress}%</td>
                    <td className="hp-table-cell mono" style={{ fontSize: 11 }}>{j.logTail[j.logTail.length - 1] ?? '-'}</td>
                    <td className="hp-table-cell">
                      {j.state === 'running' ? (
                        <button className="hp-btn" onClick={() => void window.dh.jobCancel({ id: j.id })}>{t('jobs.cancel')}</button>
                      ) : (
                        <span className="hp-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === 'Logs & History' ? (
        <section className="maint-panel">
          <div className="maint-section-head">{t('section.maintenanceHistory')}</div>
          <div className="hp-table-wrap">
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head">
                  <th className="hp-table-cell">{t('history.at')}</th>
                  <th className="hp-table-cell">{t('history.action')}</th>
                  <th className="hp-table-cell">{t('history.result')}</th>
                  <th className="hp-table-cell">{t('history.reclaimed')}</th>
                  <th className="hp-table-cell">{t('history.note')}</th>
                </tr>
              </thead>
              <tbody>
                {(state.history ?? []).length === 0 ? (
                  <tr><td className="hp-table-cell hp-muted" colSpan={5}>{t('history.noHistory')}</td></tr>
                ) : (
                  (state.history ?? []).map((h) => (
                    <tr key={h.id} className="hp-table-row">
                      <td className="hp-table-cell mono">{h.atIso}</td>
                      <td className="hp-table-cell mono">{h.action}</td>
                      <td className="hp-table-cell"><StatusPill state={h.result} /></td>
                      <td className="hp-table-cell">{h.reclaimedMb ? `~${h.reclaimedMb} MB` : '-'}</td>
                      <td className="hp-table-cell">{h.note ?? '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'Logs & History' ? (
        <section className="maint-panel">
          <div className="maint-section-head">{t('section.integrityDiagnostics')}</div>
          <p className="maint-section-lead">{t('health.diagnosticsLead')}</p>
          <div className="maint-toolbar maint-diag-toolbar">
            <div className="maint-diag-toolbar-primary">
              <button className="hp-btn hp-btn-primary" onClick={() => void runDiagnosticsWizard()} disabled={runningDiagnostics}>
                <span className="codicon codicon-run-all" aria-hidden />
                {runningDiagnostics ? t('health.running') : t('health.run')}
              </button>
              <p className="maint-toolbar-hint">{t('health.runDesc')}</p>
            </div>
            <div className="maint-diag-toolbar-secondary">
              <button type="button" className="hp-btn" onClick={() => void exportDiagnosticReport()}>
                <span className="codicon codicon-export" aria-hidden />
                {t('health.export')}
              </button>
              <p className="maint-toolbar-hint">{t('health.exportDesc')}</p>
            </div>
            <label className="maint-sensitive-toggle">
              <input
                type="checkbox"
                checked={includeSensitiveBundle}
                onChange={(e) => setIncludeSensitiveBundle(e.target.checked)}
              />
              <span>
                <strong>{t('health.includeSensitive')}</strong>
                <span className="hp-muted"> — {t('health.includeSensitiveDesc')}</span>
              </span>
            </label>
          </div>
          <div className="maint-diag-list">
            {diagnostics.length === 0 ? (
              <div className="hp-muted maint-diag-empty">
                {t('health.noDiagnostics')}
              </div>
            ) : (
              diagnostics.map((d) => (
                <DiagnosticResultRow
                  key={d.id}
                  check={d}
                  rerunning={runningDiagnostics}
                  onRerun={() => void runDiagnosticsWizard()}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      {runbook ? (
        <section className="maint-output-panel" aria-live="polite">
          <div className="maint-output-head">
            <h2 className="maint-output-title">{runbook.title}</h2>
            <button type="button" className="hp-btn" onClick={() => setRunbook(null)}>
              {t('page.close')}
            </button>
          </div>
          <pre className="maint-output-body">{runbook.text}</pre>
        </section>
      ) : null}

      {commandPeek ? (
        <section className="maint-output-panel">
          <div className="maint-output-head">
            <h2 className="maint-output-title">{t('section.commandHint')}</h2>
            <button type="button" className="hp-btn" onClick={() => setCommandPeek(null)}>
              {t('page.close')}
            </button>
          </div>
          <pre className="maint-output-body maint-output-body--compact">{commandPeek}</pre>
        </section>
      ) : null}

      {status ? (
        <div
          role="status"
          className={`hp-status-alert ${statusTone === 'success' ? 'success' : 'warning'}`}
          style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>{status}</span>
          <button type="button" className="hp-btn" onClick={() => setStatus('')} aria-label={t('page.dismissNotification')}>
            {t('page.dismiss')}
          </button>
        </div>
      ) : null}
      </div>
    </div>
  )
}

function StatusPill({ state }: { state: string }): ReactElement {
  const { t } = useTranslation('maintenance')
  const color =
    state === 'running' || state === 'healthy' || state === 'active' || state === 'success'
      ? 'var(--green)'
      : state === 'completed'
        ? 'var(--accent)'
        : state === 'degraded' || state === 'failed' || state === 'inactive'
          ? 'var(--orange)'
          : state === 'offline'
            ? 'var(--red)'
            : 'var(--text-muted)'
  return (
    <span
      className="maint-status-pill"
      style={{
        border: `1px solid ${color}66`,
        color,
        background: `${color}14`,
        boxShadow: `0 0 20px -8px ${color}`,
      }}
    >
      {({
        active: t('statusPill.active'),
        inactive: t('statusPill.inactive'),
        unknown: t('statusPill.unknown'),
        not_installed: t('statusPill.notInstalled'),
      }[state] ?? state).toUpperCase()}
    </span>
  )
}
