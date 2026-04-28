import {
  CustomProfileEntrySchema,
  CustomProfilesStoreSchema,
  type ComposeProfile,
  type ContainerRow,
  type CustomProfileEntry,
  type HostMetricsResponse,
} from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { CustomProfileWizardModal } from '../dashboard/CustomProfileWizardModal'

export function DashboardMainPage(): ReactElement {
  const [docker, setDocker] = useState<
    { ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null
  >(null)
  const [snap, setSnap] = useState<HostMetricsResponse | null>(null)
  const [composeMsg, setComposeMsg] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [customProfiles, setCustomProfiles] = useState<CustomProfileEntry[]>([])

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
      const m = (await window.dh.metrics()) as HostMetricsResponse
      setSnap(m)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 4000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    void (async () => {
      try {
        const profiles = await window.dh.storeGet({ key: 'custom_profiles' })
        if (profiles) {
          const parsed = CustomProfilesStoreSchema.safeParse(profiles)
          if (parsed.success) setCustomProfiles(parsed.data)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  async function initProfile(profile: ComposeProfile): Promise<void> {
    setComposeMsg(`Starting ${profile}…`)
    const r = (await window.dh.composeUp({ profile })) as { ok: boolean; log: string }
    setComposeMsg(r.ok ? `Compose up: OK\n${r.log}` : `Compose error\n${r.log}`)
    void refresh()
  }

  const rows = docker?.ok ? docker.rows.slice(0, 8) : []
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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 720 }}>
          Dashboard cards and Docker overview stay on{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>Main</span>. Pin
          widgets and shortcuts on the dedicated{' '}
          <Link to="/dashboard/widgets" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Widget
          </Link>{' '}
          page (top bar tab).
        </p>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--accent)',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <span className="codicon codicon-settings-gear" style={{ marginRight: 8 }} aria-hidden />
          Custom profile…
        </button>
      </div>

      <CustomProfileWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSave={async (data) => {
          const entry = CustomProfileEntrySchema.parse(data)
          const next = CustomProfilesStoreSchema.parse([...customProfiles, entry])
          setCustomProfiles(next)
          await window.dh.storeSet({ key: 'custom_profiles', data: next })
          setWizardOpen(false)
        }}
      />

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
        />
        <ProfileCard
          tag="PROFILE_02"
          title="Python Data Science"
          accent="var(--orange)"
          description="Jupyter + scientific Python image stub for notebooks and datasets."
          icon="graph"
          onInit={() => void initProfile('data-science')}
        />
        <ProfileCard
          tag="PROFILE_03"
          title="AI/ML Local"
          accent="var(--blue)"
          description="PyTorch/CUDA-friendly compose stub—drivers stay on the host."
          icon="hubot"
          onInit={() => void initProfile('ai-ml')}
        />
        <ProfileCard
          tag="PROFILE_04"
          title="Mobile App Dev"
          accent="var(--green)"
          description="React Native / Flutter environment stub."
          icon="device-mobile"
          onInit={() => void initProfile('mobile')}
        />
        <ProfileCard
          tag="PROFILE_05"
          title="Game Development"
          accent="var(--yellow)"
          description="Godot/Unity/Unreal minimal engine stub."
          icon="play-circle"
          onInit={() => void initProfile('game-dev')}
        />
        <ProfileCard
          tag="PROFILE_06"
          title="Infra / K8s"
          accent="var(--purple)"
          description="Local minikube/k3d or Terraform runner stub."
          icon="server-environment"
          onInit={() => void initProfile('infra')}
        />
        <ProfileCard
          tag="PROFILE_07"
          title="Desktop Qt/GTK"
          accent="var(--cyan)"
          description="Native desktop application build environment."
          icon="window"
          onInit={() => void initProfile('desktop-gui')}
        />
        <ProfileCard
          tag="PROFILE_08"
          title="Docs / Writing"
          accent="var(--red)"
          description="Jekyll/Hugo/Docusaurus writing environment."
          icon="book"
          onInit={() => void initProfile('docs')}
        />
        <ProfileCard
          tag="PROFILE_09"
          title="Empty Minimal"
          accent="var(--text-muted)"
          description="Clean slate alpine image for general scripting."
          icon="blank"
          onInit={() => void initProfile('empty')}
        />
        {customProfiles.map((p, i) => (
          <ProfileCard
            key={i}
            tag="CUSTOM"
            title={p.name}
            accent="var(--accent)"
            description={`Custom profile based on ${p.baseTemplate}.`}
            icon="code"
            onInit={() => void initProfile(p.baseTemplate)}
          />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <section
          style={{
            background: 'var(--bg-widget)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>What&apos;s running</div>
            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {docker?.ok ? `${docker.rows.length} containers` : 'Docker offline'}
            </div>
          </div>
          {!docker ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading Docker…</div>
          ) : !docker.ok ? (
            <div style={{ color: 'var(--orange)' }}>{docker.error}</div>
          ) : rows.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No containers reported.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 4px' }}>Name</th>
                  <th>Status</th>
                  <th>Ports</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px' }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {r.image}
                      </div>
                    </td>
                    <td>
                      <StatusPill state={r.state} />
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.ports}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        style={tinyBtn}
                        onClick={() => void dockerAction(r.id, 'restart')}
                      >
                        restart
                      </button>
                      <button
                        type="button"
                        style={tinyBtn}
                        onClick={() => void dockerAction(r.id, 'stop')}
                      >
                        stop
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section
            style={{
              background: 'var(--bg-widget)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Resource allocation</div>
            {m ? (
              <>
                <MetricBar label="CPU" value={`${m.cpuUsagePercent}%`} pct={m.cpuUsagePercent} tone="purple" />
                <MetricBar
                  label="RAM"
                  value={`${(m.totalMemMb - m.freeMemMb).toFixed(1)} / ${m.totalMemMb} MB`}
                  pct={Math.min(100, Math.round(((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100))}
                  tone="orange"
                />
                <MetricBar
                  label={`DISK (${m.diskTotalGb} GB)`}
                  value={`${m.diskFreeGb} GB free`}
                  pct={
                    m.diskTotalGb > 0
                      ? Math.min(100, Math.round((m.diskFreeGb / m.diskTotalGb) * 100))
                      : 0
                  }
                  tone="blue"
                />
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Collecting metrics…</div>
            )}
          </section>
          <section
            style={{
              background: 'var(--bg-widget)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div className="codicon codicon-zap" style={{ color: 'var(--accent)', fontSize: 22 }} />
            <div style={{ fontWeight: 600, marginTop: 8 }}>Update Available</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Check Flathub release notes when this app ships a stable bundle.
            </p>
            <button type="button" style={linkish} onClick={() => void window.dh.openExternal('https://flathub.org')}>
              View on Flathub
            </button>
          </section>
        </div>
      </div>
    </div>
  )

  async function dockerAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    if (!window.confirm(`${action} this container?`)) return
    await window.dh.dockerAction({ id, action })
    void refresh()
  }
}

function ProfileCard(props: {
  tag: string
  title: string
  description: string
  accent: string
  icon: string
  onInit: () => void
}): ReactElement {
  return (
    <article
      style={{
        background: 'var(--bg-widget)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
      }}
    >
      <span
        className="mono"
        style={{ position: 'absolute', top: 14, right: 14, color: 'var(--text-muted)', fontSize: 11 }}
      >
        {props.tag}
      </span>
      <span className={`codicon codicon-${props.icon}`} style={{ fontSize: 28, color: props.accent }} />
      <h3 style={{ margin: 0, fontSize: 17 }}>{props.title}</h3>
      <p style={{ margin: 0, color: 'var(--text-muted)', flex: 1, fontSize: 14 }}>{props.description}</p>
      <button
        type="button"
        onClick={props.onInit}
        style={{
          alignSelf: 'flex-start',
          border: 'none',
          background: 'none',
          color: props.accent,
          fontWeight: 600,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        INITIALIZE →
      </button>
    </article>
  )
}

function MetricBar(props: {
  label: string
  value: string
  pct: number
  tone: 'purple' | 'orange' | 'blue'
}): ReactElement {
  const colors = {
    purple: 'var(--accent)',
    orange: 'var(--orange)',
    blue: 'var(--blue)',
  } as const
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{props.label}</span>
        <span className="mono">{props.value}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 999,
          background: '#2a2a2a',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, props.pct)}%`,
            background: colors[props.tone],
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

function StatusPill({ state }: { state: string }): ReactElement {
  const up = state === 'running'
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: up ? 'var(--green)' : 'var(--yellow)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: up ? 'var(--green)' : 'var(--yellow)',
        }}
      />
      {state.toUpperCase()}
    </span>
  )
}

const tinyBtn: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 4,
  padding: '4px 8px',
  marginLeft: 6,
  fontSize: 11,
  cursor: 'pointer',
}

const linkish: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  cursor: 'pointer',
  padding: 0,
  fontWeight: 600,
}
