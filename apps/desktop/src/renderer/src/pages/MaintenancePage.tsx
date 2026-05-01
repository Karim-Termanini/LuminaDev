import { ComposeProfileSchema, type ComposeProfile, type ContainerRow, type HostMetricsResponse, type HostSecuritySnapshot, type JobSummary, type MaintenanceProfileHealth, type MaintenanceStateStore, type MaintenanceTask } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { humanizeDashboardError } from './dashboardError'
import { humanizeDockerError } from './dockerError'
import { humanizeRuntimeError } from './runtimeError'
import { collectAccessibilitySnapshot, evaluateAccessibilitySnapshot } from './accessibilityAudit'
import { evaluateGuardian } from './maintenanceGuardian'
import { OPS_RUNBOOK, maintenanceStatusTone } from './maintenancePageHelpers'
import './MaintenancePage.css'

const CRON_HINTS = ['0 */6 * * *', '0 3 * * *', '30 2 * * 0']
const SYSTEMD_UNITS = ['docker', 'ssh', 'nginx', 'ufw'] as const
const STATUS_AUTO_DISMISS_MS = 12_000
const profileIds = ComposeProfileSchema.options
const TABS = [
  'Overview / Health Dashboard',
  'System Cleanup',
  'Docker Maintenance',
  'Data & Profiles',
  'Logs & History',
  'Scheduled / Automation',
] as const

type ServiceState = Record<string, 'active' | 'inactive' | 'unknown'>
type CleanupPreview = { containers: number; images: number; volumes: number; networks: number } | null
type TabId = (typeof TABS)[number]
type DiagnosticCheck = { id: string; label: string; ok: boolean; details: string }
type PerfSnapshot = { startupMs: number; rssMb: number; heapUsedMb: number; heapTotalMb: number; uptimeSec: number }

type RunbookOp = (typeof OPS_RUNBOOK)[number]

const MAINT_TAB_META: Record<TabId, { icon: string; short: string }> = {
  'Overview / Health Dashboard': { icon: 'dashboard', short: 'Overview' },
  'System Cleanup': { icon: 'trash', short: 'Cleanup' },
  'Docker Maintenance': { icon: 'package', short: 'Docker' },
  'Data & Profiles': { icon: 'folder', short: 'Data' },
  'Logs & History': { icon: 'history', short: 'Logs' },
  'Scheduled / Automation': { icon: 'watch', short: 'Schedule' },
}

function MaintenanceRunbookStrip({
  runbookBusyId,
  onRun,
}: {
  runbookBusyId: string | null
  onRun: (op: RunbookOp) => void
}): ReactElement {
  return (
    <>
      <div className="maint-runbook-label">Host diagnostics</div>
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
            <span>{runbookBusyId === op.id ? 'Running…' : op.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export function MaintenancePage(): ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('Overview / Health Dashboard')
  const [metrics, setMetrics] = useState<HostMetricsResponse | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [state, setState] = useState<MaintenanceStateStore>({ tasks: [], profileHealth: [], history: [] })
  const [serviceState, setServiceState] = useState<ServiceState>({})
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview>(null)
  const [cleanupSelection, setCleanupSelection] = useState({ containers: true, images: true, volumes: false, networks: false })
  const [recommendedSelection, setRecommendedSelection] = useState({
    clearCache: true,
    pruneDocker: true,
    cleanLogs: true,
    refreshWidgets: true,
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
  const [runbook, setRunbook] = useState<{ title: string; text: string } | null>(null)
  const [runbookBusyId, setRunbookBusyId] = useState<string | null>(null)
  const [commandPeek, setCommandPeek] = useState<string | null>(null)

  const saveState = useCallback(async (next: MaintenanceStateStore) => {
    setSavingState(true)
    try {
      await window.dh.storeSet({ key: 'maintenance_state', data: next })
      setState(next)
      setStatus('Maintenance state saved.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingState(false)
    }
  }, [])

  const refreshCleanupPreview = useCallback(async () => {
    try {
      const res = (await window.dh.dockerPrunePreview()) as {
        ok: boolean
        preview?: { containers: number; images: number; volumes: number; networks: number }
        error?: string
      }
      if (res.ok) {
        setCleanupPreview(res.preview ?? null)
      } else {
        setCleanupPreview(null)
        setStatus(humanizeDockerError(res.error))
      }
    } catch (e) {
      setStatus(humanizeDockerError(e))
      setCleanupPreview(null)
    }
  }, [])

  const refreshLive = useCallback(async () => {
    try {
      const m = await window.dh.metrics()
      if (m.ok) {
        setMetrics(m)
      } else {
        setStatus(humanizeDashboardError(m.error))
      }
      const c = (await window.dh.dockerList()) as { ok: boolean; rows: ContainerRow[]; error?: string }
      if (c.ok) setContainers(c.rows)
      else setStatus(humanizeDockerError(c.error))
      const j = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(j) ? j : [])
      await refreshCleanupPreview()
    } catch (e) {
      setStatus(humanizeDashboardError(e))
    }
  }, [refreshCleanupPreview])

  const refreshSystemdSnapshot = useCallback(async () => {
    const next: ServiceState = {}
    await Promise.all(
      SYSTEMD_UNITS.map(async (unit) => {
        try {
          const res = await window.dh.hostExec({ command: 'systemctl_is_active', unit })
          const out = (res.ok ? String(res.result ?? '') : '').trim().toLowerCase()
          next[unit] = out.includes('active') ? 'active' : out ? 'inactive' : 'unknown'
        } catch {
          next[unit] = 'unknown'
        }
      })
    )
    setServiceState(next)
  }, [])

  const refreshStatic = useCallback(async () => {
    try {
      const sec = await window.dh.monitorSecurity()
      setSecurity(sec.ok ? sec.snapshot : null)
      if (!sec.ok && sec.error) {
        setStatus(humanizeDashboardError(sec.error))
      }
      const stored = await window.dh.storeGet({ key: 'maintenance_state' })
      if (stored.ok) {
        setState((stored.data as MaintenanceStateStore | null) ?? { tasks: [], profileHealth: [], history: [] })
      } else {
        setState({ tasks: [], profileHealth: [], history: [] })
        setStatus(stored.error || 'Failed to load maintenance state.')
      }
      await refreshSystemdSnapshot()
    } catch (e) {
      setStatus(humanizeDashboardError(e))
    }
  }, [refreshSystemdSnapshot])

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
  const guardian = useMemo(() => evaluateGuardian(m, security, containers), [m, security, containers])
  const activeJobCount = useMemo(() => jobs.filter((j) => j.state === 'running').length, [jobs])
  const degradedProfiles = state.profileHealth.filter((p) => p.health === 'degraded').length
  const lastMaintenanceDaysAgo = state.lastMaintenanceAtIso
    ? Math.floor((Date.now() - new Date(state.lastMaintenanceAtIso).getTime()) / (1000 * 3600 * 24))
    : null

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
        note: hasErrors ? 'Error markers found in compose logs.' : 'Compose logs inspected from maintenance.',
      }
      const next = { ...state, profileHealth: [nextEntry, ...state.profileHealth.filter((x) => x.profile !== profile)].slice(0, 40) }
      await saveState(next)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
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
          ? 'Compose up succeeded.'
          : (humanizeDockerError(res.error || res.log || 'Compose up returned non-zero.')).slice(0, 280),
      }
      const next = { ...state, profileHealth: [nextEntry, ...state.profileHealth.filter((x) => x.profile !== profile)].slice(0, 40) }
      await saveState(next)
      await refreshLive()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function runCleanup(): Promise<void> {
    setBusyCleanup(true)
    try {
      const res = (await window.dh.dockerCleanupRun(cleanupSelection)) as {
        ok: boolean
        reclaimedBytes?: number
        error?: string
      }
      if (!res.ok) {
        throw new Error(humanizeDockerError(res.error))
      }
      const mb = Math.round((((res.reclaimedBytes ?? 0) / (1024 * 1024)) * 10)) / 10
      setStatus(`Cleanup finished. Reclaimed ~${mb} MB.`)
      await appendHistory('docker.cleanup', 'success', 'Selected Docker cleanup executed.', mb)
      await refreshLive()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
      await appendHistory('docker.cleanup', 'failed', e instanceof Error ? e.message : String(e))
    } finally {
      setBusyCleanup(false)
    }
  }

  async function runRecommendedMaintenance(): Promise<void> {
    if (recommendedSelection.pruneDocker) {
      await runCleanup()
    }
    if (recommendedSelection.refreshWidgets) {
      const layoutRes = await window.dh.layoutGet()
      if (layoutRes.ok) {
        const saveRes = await window.dh.layoutSet(layoutRes.layout)
        if (!saveRes.ok) {
          throw new Error(saveRes.error || 'Failed to refresh widget layout cache.')
        }
        await appendHistory('widgets.refresh', 'success', 'Widget layout cache refreshed.')
      } else {
        throw new Error(layoutRes.error || 'Failed to load widget layout cache.')
      }
    }
    if (recommendedSelection.clearCache) {
      await appendHistory('cache.cleanup.manual', 'warning', 'Use runbook command templates for host cache cleanup.')
    }
    if (recommendedSelection.cleanLogs) {
      await appendHistory('logs.cleanup.manual', 'warning', 'Job logs are session-bound; app log cleanup is manual currently.')
    }
    setStatus('Recommended maintenance completed.')
  }

  async function saveReminder(days: number): Promise<void> {
    await saveState({ ...state, reminderDays: days })
    if (Notification.permission === 'granted') {
      new Notification('LuminaDev maintenance reminder', { body: `Reminder set to every ${days} day(s).` })
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
        : res.error ?? 'Request failed'
      setRunbook({ title: op.label, text })
    } catch (e) {
      setRunbook({ title: op.label, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunbookBusyId(null)
    }
  }, [])

  async function runDiagnosticsWizard(): Promise<void> {
    setRunningDiagnostics(true)
    try {
      const checks: DiagnosticCheck[] = []
      const docker = (await window.dh.dockerCheckInstalled()) as { docker: boolean; compose: boolean; buildx: boolean }
      checks.push({
        id: 'docker',
        label: 'Docker connectivity',
        ok: docker.docker && docker.compose,
        details: `docker=${docker.docker} compose=${docker.compose} buildx=${docker.buildx}`,
      })

      const hostSecRes = await window.dh.monitorSecurity()
      const hostSec = hostSecRes.ok ? hostSecRes.snapshot : null
      checks.push({
        id: 'security',
        label: 'Security baseline',
        ok: Boolean(hostSec && hostSec.firewall === 'active' && hostSec.sshPasswordAuth !== 'yes'),
        details: hostSec
          ? `firewall=${hostSec.firewall}, sshPasswordAuth=${hostSec.sshPasswordAuth}`
          : hostSecRes.error || 'Security snapshot unavailable',
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
        label: 'Git identity',
        ok: hasName && hasEmail,
        details: gitHost.ok ? `user.name=${hasName} user.email=${hasEmail}` : gitHost.error || 'Git config unavailable',
      })

      const sshHost = await window.dh.sshGetPub({ target: 'host' })
      checks.push({
        id: 'ssh',
        label: 'SSH key',
        ok: Boolean(sshHost.ok && sshHost.pub),
        details: sshHost.ok && sshHost.fingerprint ? `fingerprint=${sshHost.fingerprint}` : 'No host SSH key detected',
      })

      const rt = await window.dh.runtimeStatus()
      const critical = ['node', 'python', 'rust']
      const installedCount = rt.ok
        ? critical.filter((id) => rt.runtimes.some((r) => r.id === id && r.installed)).length
        : 0
      checks.push({
        id: 'runtimes',
        label: 'Core runtimes',
        ok: installedCount >= 2,
        details: rt.ok ? `${installedCount}/3 core runtimes installed` : humanizeRuntimeError(rt.error),
      })

      const perf = await window.dh.perfSnapshot()
      const snap = perf.ok ? (perf.snapshot as PerfSnapshot | undefined) : undefined
      checks.push({
        id: 'perf',
        label: 'Performance baseline',
        ok: Boolean(snap && snap.rssMb < 900 && snap.startupMs < 120000),
        details: snap
          ? `startup=${snap.startupMs}ms rss=${snap.rssMb}MB heap=${snap.heapUsedMb}/${snap.heapTotalMb}MB uptime=${snap.uptimeSec}s`
          : perf.error || 'Perf snapshot unavailable',
      })

      const a11ySnapshot = collectAccessibilitySnapshot(document)
      const a11y = evaluateAccessibilitySnapshot(a11ySnapshot)
      checks.push({
        id: 'a11y',
        label: 'Accessibility baseline',
        ok: a11y.ok,
        details: a11y.details,
      })

      setDiagnostics(checks)
      const failed = checks.filter((c) => !c.ok).length
      await appendHistory('diagnostics.run', failed === 0 ? 'success' : 'warning', `${failed} check(s) failed out of ${checks.length}.`)
      setStatus(failed === 0 ? 'Diagnostics passed.' : `Diagnostics completed with ${failed} issue(s).`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
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
    setStatus(`Support bundle exported: ${res.path ?? 'Downloads/LuminaDev'} (${includeSensitiveBundle ? 'full' : 'redacted'})`)
    await appendHistory('diagnostics.export', 'success', `Support bundle exported (${includeSensitiveBundle ? 'include-sensitive' : 'redacted'}).`)
  }

  return (
    <div className="maint-page">
      <header className="maint-hero">
        <div className="maint-hero-eyebrow">Workspace care</div>
        <h1 className="maint-hero-title">Maintenance</h1>
        <p className="maint-hero-sub">
          {degradedProfiles > 0 ? `${degradedProfiles} profile issues detected.` : 'Your workstation looks healthy.'}{' '}
          Last maintenance: {lastMaintenanceDaysAgo === null ? 'never' : `${lastMaintenanceDaysAgo} day(s) ago`}.
        </p>
      </header>

      <section className="hp-card maint-tabs-panel">
        <nav className="maint-tabs-scroll" aria-label="Maintenance sections">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`maint-tab ${activeTab === tab ? 'maint-tab-active' : ''}`}
              title={tab}
              onClick={() => setActiveTab(tab)}
            >
              <span className={`codicon codicon-${MAINT_TAB_META[tab].icon}`} aria-hidden />
              <span>{MAINT_TAB_META[tab].short}</span>
              <span className="maint-tab-full">{tab}</span>
            </button>
          ))}
        </nav>
      </section>

      {(activeTab === 'Overview / Health Dashboard' || activeTab === 'System Cleanup') ? (
      <section className="hp-card">
        {activeTab === 'Overview / Health Dashboard' && activeJobCount > 0 ? (
          <div className="maint-job-banner">
            <span style={{ fontSize: 14 }}>
              <strong>{activeJobCount}</strong> job{activeJobCount === 1 ? '' : 's'} running (install, diagnostics, etc.).
            </span>
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              style={{ fontSize: 12 }}
              onClick={() => document.getElementById('maintenance-job-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              View job runner
            </button>
          </div>
        ) : null}
        <div className="hp-grid-2" style={{ gap: 18, alignItems: 'stretch' }}>
          <div style={{ minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="hp-section-title">System overview</div>
            <div className="maint-score-wrap">
              <div>
                <div className="maint-score-num">{guardian.score === null ? '—' : `${guardian.score}%`}</div>
                <div className="maint-score-sub">Guardian health</div>
              </div>
            </div>
            <div className="maint-kpi-row">
              <span className="maint-kpi">CPU {m?.cpuUsagePercent.toFixed(1) ?? '—'}%</span>
              <span className="maint-kpi">Mem {m ? Math.round(((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100) : '—'}%</span>
              <span className="maint-kpi">Disk {m ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : '—'}%</span>
              <span className="maint-kpi">Docker {runningContainers}/{containers.length}</span>
            </div>
          </div>
          <div style={{ minHeight: 130 }}>
            <div className="hp-section-title">Run Recommended Maintenance</div>
            <div className="hp-grid-gap-8" style={{ fontSize: 13, marginTop: 4 }}>
              <label><input type="checkbox" checked={recommendedSelection.clearCache} onChange={(e) => setRecommendedSelection((p) => ({ ...p, clearCache: e.target.checked }))} /> Clear app cache/temp (manual-assisted)</label>
              <label><input type="checkbox" checked={recommendedSelection.pruneDocker} onChange={(e) => setRecommendedSelection((p) => ({ ...p, pruneDocker: e.target.checked }))} /> Prune Docker resources</label>
              <label><input type="checkbox" checked={recommendedSelection.cleanLogs} onChange={(e) => setRecommendedSelection((p) => ({ ...p, cleanLogs: e.target.checked }))} /> Clean old logs (manual-assisted)</label>
              <label><input type="checkbox" checked={recommendedSelection.refreshWidgets} onChange={(e) => setRecommendedSelection((p) => ({ ...p, refreshWidgets: e.target.checked }))} /> Refresh widget registry cache</label>
              <button className="hp-btn hp-btn-primary" onClick={() => void runRecommendedMaintenance()} disabled={busyCleanup || savingState}>
                Run Quick Maintenance
              </button>
            </div>
          </div>
        </div>
        {activeTab === 'Overview / Health Dashboard' ? (
          <div className="maint-divider">
            <div className="hp-section-title">Guardian layers</div>
            <p className="hp-muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 6, marginBottom: 14 }}>
              Each layer reads a specific IPC signal. The headline score is <strong>100</strong> minus the deductions shown on
              failing layers (floored at 0). This is the coded definition of “Guardian” in this app — not a separate marketing score.
            </p>
            <div className="maint-layer-grid">
              {guardian.layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`maint-layer-tile ${layer.ok ? 'maint-layer-tile--ok' : 'maint-layer-tile--warn'}`}
                >
                  <div style={{ fontWeight: 750, fontSize: 14, letterSpacing: '-0.01em' }}>{layer.title}</div>
                  <div className="hp-muted" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>{layer.signals}</div>
                  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>{layer.detail}</div>
                  {layer.deduction > 0 ? (
                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, color: 'var(--orange)' }}>−{layer.deduction} pts</div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, color: 'var(--green)' }}>−0 pts</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {(activeTab === 'Overview / Health Dashboard' || activeTab === 'Data & Profiles') ? (
      <section className="hp-card">
        <div className="hp-section-title">Infrastructure Status</div>
        <div className="hp-row-wrap" style={{ marginBottom: 12, rowGap: 8 }}>
          <button className="hp-btn" onClick={() => void checkAllProfiles()} disabled={savingState}>Check all profiles</button>
          <button className="hp-btn" onClick={() => void refreshSystemdSnapshot()} disabled={savingState}>Refresh systemd snapshot</button>
        </div>
        <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">Profile</th>
                <th className="hp-table-cell">Health</th>
                <th className="hp-table-cell">Last Checked</th>
                <th className="hp-table-cell">Last Run</th>
                <th className="hp-table-cell">Actions</th>
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
                        <button className="hp-btn" onClick={() => void checkProfileHealth(profile)} disabled={savingState}>Check</button>
                        <button className="hp-btn" onClick={() => void runProfile(profile)} disabled={savingState}>Run</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {SYSTEMD_UNITS.map((unit) => (
            <div key={unit} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div className="hp-muted" style={{ fontSize: 11 }}>{unit}</div>
              <div style={{ marginTop: 6 }}><StatusPill state={serviceState[unit] ?? 'unknown'} /></div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {(activeTab === 'Docker Maintenance' || activeTab === 'System Cleanup') ? (
      <section className="hp-card">
        <div className="hp-section-title">Docker Cleanup Planner</div>
        <div className="hp-row-wrap" style={{ rowGap: 8 }}>
          <label><input type="checkbox" checked={cleanupSelection.containers} onChange={(e) => setCleanupSelection((p) => ({ ...p, containers: e.target.checked }))} /> Containers</label>
          <label><input type="checkbox" checked={cleanupSelection.images} onChange={(e) => setCleanupSelection((p) => ({ ...p, images: e.target.checked }))} /> Images</label>
          <label><input type="checkbox" checked={cleanupSelection.volumes} onChange={(e) => setCleanupSelection((p) => ({ ...p, volumes: e.target.checked }))} /> Volumes</label>
          <label><input type="checkbox" checked={cleanupSelection.networks} onChange={(e) => setCleanupSelection((p) => ({ ...p, networks: e.target.checked }))} /> Networks</label>
          <button className="hp-btn hp-btn-primary" onClick={() => void runCleanup()} disabled={busyCleanup}>{busyCleanup ? 'Running...' : 'Run cleanup'}</button>
        </div>
        {cleanupPreview ? (
          <div className="hp-row-wrap hp-muted" style={{ marginTop: 8, fontSize: 12 }}>
            <span>stopped containers: {cleanupPreview.containers}</span>
            <span>unused images: {cleanupPreview.images}</span>
            <span>orphan volumes: {cleanupPreview.volumes}</span>
            <span>orphan networks: {cleanupPreview.networks}</span>
          </div>
        ) : null}
      </section>
      ) : null}

      {(activeTab === 'Data & Profiles' || activeTab === 'Scheduled / Automation') ? (
      <section className="hp-card">
        <div className="hp-section-title">Maintenance Tasks & Runbook</div>
        <div className="hp-grid-gap-8" style={{ marginTop: 6 }}>
          <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="hp-input" placeholder="Task title (e.g. rotate local logs)" />
          <div className="hp-grid-2">
            <input value={newCron} onChange={(e) => setNewCron(e.target.value)} className="hp-input" placeholder="Cron hint (optional)" />
            <input value={newCmd} onChange={(e) => setNewCmd(e.target.value)} className="hp-input" placeholder="Command hint (optional)" />
          </div>
          <div className="hp-row-wrap">
            <button className="hp-btn hp-btn-primary" onClick={() => void addTask()} disabled={savingState || !newTaskTitle.trim()}>Add task</button>
            {CRON_HINTS.map((hint) => (
              <button key={hint} className="hp-btn" onClick={() => setNewCron(hint)} disabled={savingState}>Use {hint}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {state.tasks.length === 0 ? (
            <div className="hp-muted">No maintenance tasks yet. Use the host actions below — output opens in a panel (no terminal copy/paste).</div>
          ) : (
            state.tasks.map((task) => (
              <div key={task.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div className="hp-row-wrap" style={{ justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={task.done} onChange={() => void updateTask(task.id, { done: !task.done })} />
                    <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
                  </label>
                  <button className="hp-btn hp-btn-danger" onClick={() => void removeTask(task.id)}>Delete</button>
                </div>
                {task.cronHint ? <div className="mono hp-muted" style={{ fontSize: 11, marginTop: 6 }}>cron: {task.cronHint}</div> : null}
                {task.commandHint ? (
                  <div className="hp-row-wrap" style={{ marginTop: 6 }}>
                    <button type="button" className="hp-btn" onClick={() => setCommandPeek(task.commandHint ?? '')}>
                      View command hint
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <MaintenanceRunbookStrip runbookBusyId={runbookBusyId} onRun={runHostProbe} />
      </section>
      ) : null}

      {(activeTab === 'Logs & History' || activeTab === 'Overview / Health Dashboard') ? (
      <section className="hp-card" id="maintenance-job-runner">
        <div className="hp-section-title">Job Runner (active tasks)</div>
        <p className="hp-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
          Long-running work from the Phase 0 job runner (install runtimes, etc.). Polls with the maintenance page refresh.
        </p>
        <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">Kind</th>
                <th className="hp-table-cell">State</th>
                <th className="hp-table-cell">Progress</th>
                <th className="hp-table-cell">Tail</th>
                <th className="hp-table-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td className="hp-table-cell hp-muted" colSpan={5}>No jobs yet.</td></tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hp-table-row">
                    <td className="hp-table-cell mono">{j.kind}</td>
                    <td className="hp-table-cell"><StatusPill state={j.state} /></td>
                    <td className="hp-table-cell mono">{j.progress}%</td>
                    <td className="hp-table-cell mono" style={{ fontSize: 11 }}>{j.logTail[j.logTail.length - 1] ?? '-'}</td>
                    <td className="hp-table-cell">
                      {j.state === 'running' ? (
                        <button className="hp-btn" onClick={() => void window.dh.jobCancel({ id: j.id })}>Cancel</button>
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

      {activeTab === 'Scheduled / Automation' ? (
        <section className="hp-card">
          <div className="hp-section-title">Scheduled / Automation</div>
          <div className="hp-row-wrap">
            <button className="hp-btn" onClick={() => void saveReminder(3)}>Reminder 3d</button>
            <button className="hp-btn" onClick={() => void saveReminder(7)}>Reminder 7d</button>
            <button className="hp-btn" onClick={() => void saveReminder(14)}>Reminder 14d</button>
            <span className="hp-muted">Current: {state.reminderDays ?? 'none'} day(s)</span>
          </div>
        </section>
      ) : null}

      {activeTab === 'Logs & History' ? (
        <section className="hp-card">
          <div className="hp-section-title">Maintenance History</div>
          <div className="hp-table-wrap">
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head">
                  <th className="hp-table-cell">At</th>
                  <th className="hp-table-cell">Action</th>
                  <th className="hp-table-cell">Result</th>
                  <th className="hp-table-cell">Reclaimed</th>
                  <th className="hp-table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {(state.history ?? []).length === 0 ? (
                  <tr><td className="hp-table-cell hp-muted" colSpan={5}>No history yet.</td></tr>
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

      {(activeTab === 'Logs & History' || activeTab === 'Overview / Health Dashboard') ? (
        <section className="hp-card">
          <div className="hp-section-title">Integrity & diagnostics</div>
          <div className="maint-toolbar">
            <button className="hp-btn hp-btn-primary" onClick={() => void runDiagnosticsWizard()} disabled={runningDiagnostics}>
              <span className="codicon codicon-run-all" aria-hidden style={{ fontSize: 15 }} />
              {runningDiagnostics ? 'Running…' : 'Run diagnostics'}
            </button>
            <button type="button" className="hp-btn" onClick={() => void exportDiagnosticReport()}>
              <span className="codicon codicon-export" aria-hidden style={{ fontSize: 15 }} />
              Export report
            </button>
            <label className="hp-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={includeSensitiveBundle}
                onChange={(e) => setIncludeSensitiveBundle(e.target.checked)}
              />
              Include sensitive bundle
            </label>
          </div>
          <div className="maint-diag-list">
            {diagnostics.length === 0 ? (
              <div className="hp-muted" style={{ padding: '8px 0' }}>
                No diagnostics run yet. Run checks above, then use host actions for deeper probes.
              </div>
            ) : (
              diagnostics.map((d) => (
                <div key={d.id} className={`maint-diag-row ${d.ok ? 'maint-diag-row--pass' : 'maint-diag-row--fail'}`}>
                  <strong style={{ fontSize: 14 }}>{d.label}</strong>
                  <StatusPill state={d.ok ? 'success' : 'failed'} />
                  <div className="maint-diag-detail mono hp-muted">{d.details}</div>
                </div>
              ))
            )}
          </div>
          <MaintenanceRunbookStrip runbookBusyId={runbookBusyId} onRun={runHostProbe} />
        </section>
      ) : null}

      {runbook ? (
        <section className="hp-card maint-output-panel" aria-live="polite">
          <div className="maint-output-head">
            <h2 className="maint-output-title">{runbook.title}</h2>
            <button type="button" className="hp-btn" onClick={() => setRunbook(null)}>
              Close
            </button>
          </div>
          <pre className="maint-output-body">{runbook.text}</pre>
        </section>
      ) : null}

      {commandPeek ? (
        <section className="hp-card maint-output-panel">
          <div className="maint-output-head">
            <h2 className="maint-output-title">Command hint</h2>
            <button type="button" className="hp-btn" onClick={() => setCommandPeek(null)}>
              Close
            </button>
          </div>
          <pre className="maint-output-body maint-output-body--compact">{commandPeek}</pre>
        </section>
      ) : null}

      {status ? (
        <div
          role="status"
          className={`hp-status-alert ${maintenanceStatusTone(status) === 'success' ? 'success' : 'warning'}`}
          style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>{status}</span>
          <button type="button" className="hp-btn" onClick={() => setStatus('')} aria-label="Dismiss notification">
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}

function StatusPill({ state }: { state: string }): ReactElement {
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
      {state.toUpperCase()}
    </span>
  )
}
