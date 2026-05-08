import {
  type ComposeProfile,
  type ContainerRow,
  type HostMetricsResponse,
  parseStoredActiveProfile,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { humanizeDashboardError } from './dashboardError'
import { humanizeDockerError } from './dockerError'


export function DashboardMainPage(): ReactElement {
  const [docker, setDocker] = useState<
    { ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null
  >(null)
  const [snap, setSnap] = useState<HostMetricsResponse | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [composeMsg, setComposeMsg] = useState<string | null>(null)
  const [activeProfile, setActiveProfile] = useState<ComposeProfile | null>(null)

  const refresh = useCallback(async () => {
    try {
      const d = (await window.dh.dockerList()) as
        | { ok: true; rows: ContainerRow[] }
        | { ok: false; error: string }
      setDocker(d)
    } catch (e) {
      setDocker({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    try {
      const m = (await window.dh.metrics()) as HostMetricsResponse & { ok: boolean; error?: string }
      if (m.ok) {
        setSnap(m)
        setMetricsError(null)
      } else {
        setMetricsError(humanizeDashboardError(m.error))
      }
    } catch (e) {
      setMetricsError(e instanceof Error ? e.message : String(e))
    }
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as {
        ok: boolean
        data?: unknown
      }
      setActiveProfile(ap.ok ? parseStoredActiveProfile(ap.data) : null)
    } catch {
      /* keep last known */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 4000)
    return () => clearInterval(id)
  }, [refresh])

  async function initProfile(profile: ComposeProfile): Promise<void> {
    setComposeMsg(`Starting ${profile}…`)
    const r = await window.dh.composeUp({ profile })
    if (r.ok) {
      setComposeMsg(`Compose up: OK\n${r.log}`)
    } else {
      setComposeMsg(`Compose error\n${humanizeDockerError(r.error || r.log)}`)
    }
    void refresh()
  }

  const m = snap?.metrics
  const ramUsedPct = useMemo(() => {
    if (!m || m.totalMemMb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100))
  }, [m])
  const diskUsedPct = useMemo(() => {
    if (!m || m.diskTotalGb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100))
  }, [m])
  const dockerFleet = useMemo(() => {
    if (!docker || !docker.ok) return null
    const total = docker.rows.length
    const running = docker.rows.filter((r) => r.state === 'running').length
    const pct = total > 0 ? (running / total) * 100 : 0
    return { total, running, pct, barColor: dockerFleetBarColor(running, total) }
  }, [docker])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          SYSTEM.INIT()
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>What do you want to do today?</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 720 }}>
          Select a predefined environment profile or continue your existing local clusters. Compose
          stacks run via Docker; Flatpak users must allow Docker socket access.
        </p>
      </header>

      {composeMsg ? (
        <pre
          className="mono"
          style={{
            background: 'var(--bg-widget)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 12,
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          {composeMsg}
        </pre>
      ) : null}

      {/* phaseHint removed */}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 720 }}>
          Select a preset environment to initialize its compose stack. Active profile is highlighted on matching
          cards when set.
          {activeProfile ? (
            <span>
              {' '}Current: <strong style={{ color: 'var(--accent)' }}>{activeProfile}</strong>.
            </span>
          ) : null}{' '}
          Change it from the{' '}
          <Link to="/profiles" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Profiles
          </Link>{' '}
          page or the Setup Wizard.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeProfile && (
            <button
              type="button"
              className="hp-btn"
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
              onClick={() => void window.dh.storeDelete({ key: 'active_profile' }).then(() => void refresh())}
            >
              Clear Active
            </button>
          )}
          <Link to="/profiles" style={{ fontSize: 12, color: 'var(--accent)' }}>Manage Profiles →</Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
          gap: 16,
        }}
      >
        <ProfileCard
          tag="PROFILE_01"
          title="Set up Web Development"
          accent="var(--accent)"
          description="Dockerized web stack with nginx placeholder and hot-reload friendly layout."
          icon="globe"
          onInit={() => void initProfile('web-dev')}
          status="live"
          isActive={activeProfile === 'web-dev'}
        />
        <ProfileCard
          tag="PROFILE_02"
          title="Data Science"
          accent="var(--green)"
          description="Pandas, NumPy, Matplotlib & Jupyter Lab. Standard analytics stack."
          icon="graph"
          onInit={() => void initProfile('data-science')}
          status="live"
          isActive={activeProfile === 'data-science'}
        />
        <ProfileCard
          tag="PROFILE_03"
          title="AI/ML Local"
          accent="var(--blue)"
          description="PyTorch + Jupyter environment. Ready for CUDA workloads (requires host drivers)."
          icon="hubot"
          onInit={() => void initProfile('ai-ml')}
          status="live"
          isActive={activeProfile === 'ai-ml'}
        />
        <ProfileCard
          tag="PROFILE_04"
          title="Mobile App Dev"
          accent="var(--green)"
          description="React Native / Flutter environment stub."
          icon="device-mobile"
          onInit={() => void initProfile('mobile')}
          status="planned"
          isActive={activeProfile === 'mobile'}
        />
        <ProfileCard
          tag="PROFILE_05"
          title="Game Development"
          accent="var(--yellow)"
          description="Godot/Unity/Unreal minimal engine stub."
          icon="play-circle"
          onInit={() => void initProfile('game-dev')}
          status="planned"
          isActive={activeProfile === 'game-dev'}
        />
        <ProfileCard
          tag="PROFILE_06"
          title="Infra / K8s"
          accent="var(--purple)"
          description="Local minikube/k3d or Terraform runner stub."
          icon="server-environment"
          onInit={() => void initProfile('infra')}
          status="planned"
          isActive={activeProfile === 'infra'}
        />
        <ProfileCard
          tag="PROFILE_07"
          title="Desktop Qt/GTK"
          accent="var(--cyan)"
          description="Native desktop application build environment."
          icon="window"
          onInit={() => void initProfile('desktop-gui')}
          status="planned"
          isActive={activeProfile === 'desktop-gui'}
        />
        <ProfileCard
          tag="PROFILE_08"
          title="Docs / Writing"
          accent="var(--red)"
          description="Jekyll/Hugo/Docusaurus writing environment."
          icon="book"
          onInit={() => void initProfile('docs')}
          status="live"
          isActive={activeProfile === 'docs'}
        />
        <ProfileCard
          tag="PROFILE_09"
          title="Empty Minimal"
          accent="var(--text-muted)"
          description="Clean slate alpine image for general scripting."
          icon="blank"
          onInit={() => void initProfile('empty')}
          status="live"
          isActive={activeProfile === 'empty'}
        />
      </div>

      <section
        style={{
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        {!docker ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 100 }}>
            <span className="codicon codicon-package" style={{ color: 'var(--text-muted)' }} aria-hidden title="Docker" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
          </div>
        ) : !docker.ok ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, minWidth: 120 }}>
            <span className="codicon codicon-package" style={{ color: 'var(--orange)' }} aria-hidden />
            <span style={{ fontSize: 12, color: 'var(--orange)' }}>{humanizeDockerError(docker.error)}</span>
            <Link to="/docker" style={{ fontSize: 12, color: 'var(--accent)' }}>
              Open Docker →
            </Link>
          </div>
        ) : dockerFleet ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 120,
              flex: '1 1 140px',
              maxWidth: 240,
            }}
          >
            <DashboardMetricBar
              label="Docker"
              valueText={`${dockerFleet.running} / ${dockerFleet.total} running`}
              percent={dockerFleet.pct}
              barColor={dockerFleet.barColor}
            />
            <Link to="/docker" style={{ fontSize: 12, color: 'var(--accent)' }}>
              Open Docker →
            </Link>
          </div>
        ) : null}
        {m ? (
          <>
            <DashboardMetricBar
              label="CPU"
              valueText={`${m.cpuUsagePercent.toFixed(0)}%`}
              percent={m.cpuUsagePercent}
              subline={m.cpuModel ? truncateMiddle(m.cpuModel, 36) : undefined}
            />
            <DashboardMetricBar
              label="RAM"
              valueText={`${((m.totalMemMb - m.freeMemMb) / 1024).toFixed(1)} / ${(m.totalMemMb / 1024).toFixed(1)} GB`}
              percent={ramUsedPct}
            />
            <DashboardMetricBar
              label="Disk"
              valueText={`${m.diskFreeGb.toFixed(0)} GB free`}
              percent={diskUsedPct}
            />
            <Link to="/system" style={{ fontSize: 12, color: 'var(--accent)', alignSelf: 'center' }}>
              Full Monitor →
            </Link>
          </>
        ) : metricsError ? (
          <span style={{ fontSize: 12, color: 'var(--orange)' }}>{metricsError}</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Collecting metrics…</span>
        )}
      </section>
    </div>
  )

}

/** Horizontal utilization bar + label (dashboard metrics strip). */
function DashboardMetricBar(props: {
  label: string
  valueText: string
  percent: number
  subline?: string
  /** When set, bar and value color ignore utilization thresholds (e.g. Docker fleet mix). */
  barColor?: string
}): ReactElement {
  const pct = Number.isFinite(props.percent) ? Math.min(100, Math.max(0, props.percent)) : 0
  const tone = props.barColor ?? utilizationTone(pct)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 120,
        flex: '1 1 140px',
        maxWidth: 240,
      }}
      role="group"
      aria-label={`${props.label} utilization`}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{props.label}</span>
        <strong style={{ fontSize: 13, color: tone }}>{props.valueText}</strong>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${props.label} ${pct.toFixed(0)} percent`}
        style={{
          height: 6,
          borderRadius: 4,
          background: 'color-mix(in srgb, var(--border) 80%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            background: tone,
            transition: 'width 0.35s ease-out',
          }}
        />
      </div>
      {props.subline ? (
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.25, wordBreak: 'break-word' }}
        >
          {props.subline}
        </span>
      ) : null}
    </div>
  )
}

function utilizationTone(percent: number): string {
  if (percent > 85) return 'var(--red)'
  if (percent > 60) return 'var(--yellow)'
  return 'var(--green)'
}

function dockerFleetBarColor(running: number, total: number): string {
  if (total === 0) return 'var(--text-muted)'
  if (running === 0) return 'var(--yellow)'
  if (running < total) return 'var(--accent)'
  return 'var(--green)'
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = max - 3
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`
}

function ProfileCard(props: {
  tag: string
  title: string
  description: string
  accent: string
  icon: string
  onInit: () => void
  status: 'live' | 'planned'
  isActive?: boolean
}): ReactElement {
  const isPlanned = props.status === 'planned'
  return (
    <article
      style={{
        background: props.isActive ? `color-mix(in srgb, ${props.accent} 8%, var(--bg-widget))` : 'var(--bg-widget)',
        border: props.isActive ? `2px solid ${props.accent}` : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: props.isActive ? 17 : 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        opacity: isPlanned ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className={`codicon codicon-${props.icon}`} style={{ fontSize: 28, color: props.accent }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {props.tag}
          </span>
          {props.isActive && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: props.accent, color: '#fff', letterSpacing: '0.05em' }}>
              ACTIVE
            </span>
          )}
          {isPlanned && (
            <span
              style={{
                background: 'rgba(255, 193, 7, 0.1)',
                color: 'var(--yellow)',
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid rgba(255, 193, 7, 0.2)',
                letterSpacing: '0.05em',
              }}
            >
              PLANNED
            </span>
          )}
        </div>
      </div>
      <h3 style={{ margin: 0, fontSize: 17 }}>{props.title}</h3>
      <p style={{ margin: 0, color: 'var(--text-muted)', flex: 1, fontSize: 14 }}>{props.description}</p>
      <button
        type="button"
        onClick={props.onInit}
        disabled={isPlanned}
        style={{
          alignSelf: 'flex-start',
          border: 'none',
          background: 'none',
          color: isPlanned ? 'var(--text-muted)' : props.accent,
          fontWeight: 600,
          cursor: isPlanned ? 'default' : 'pointer',
          padding: 0,
          fontSize: 13,
          opacity: isPlanned ? 0.5 : 1,
        }}
      >
        {isPlanned ? 'COMING SOON' : 'INITIALIZE →'}
      </button>
    </article>
  )
}


