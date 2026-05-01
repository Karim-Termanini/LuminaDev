import {
  type ComposeProfile,
  type ContainerRow,
  type HostMetricsResponse,
  parseStoredActiveProfile,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 620 }}>
          Select a preset environment to initialize its compose stack.
          {activeProfile && <span> Active: <strong style={{ color: 'var(--accent)' }}>{activeProfile}</strong>.</span>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeProfile && (
            <button
              type="button"
              className="hp-btn"
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
              onClick={() => void window.dh.storeDelete({ key: 'active_profile' }).then(() => setActiveProfile(null))}
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
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-package" style={{ color: 'var(--text-muted)' }} aria-hidden />
          <span style={{ fontSize: 13 }}>
            {!docker ? '—' : !docker.ok ? (
              <span style={{ color: 'var(--orange)' }}>Docker offline</span>
            ) : (
              <><strong>{docker.rows.filter(r => r.state === 'running').length}</strong> running / {docker.rows.length} total</>
            )}
          </span>
          <Link to="/docker" style={{ fontSize: 12, color: 'var(--accent)', marginLeft: 4 }}>Open Docker →</Link>
        </div>
        {m && (
          <>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>CPU </span>
              <strong style={{ color: m.cpuUsagePercent > 85 ? 'var(--red)' : m.cpuUsagePercent > 60 ? 'var(--yellow)' : 'var(--green)' }}>
                {m.cpuUsagePercent.toFixed(0)}%
              </strong>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>RAM </span>
              <strong>{((m.totalMemMb - m.freeMemMb) / 1024).toFixed(1)} / {(m.totalMemMb / 1024).toFixed(1)} GB</strong>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Disk </span>
              <strong>{m.diskFreeGb} GB free</strong>
            </div>
            <Link to="/system" style={{ fontSize: 12, color: 'var(--accent)' }}>Full Monitor →</Link>
          </>
        )}
      </section>
    </div>
  )

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


