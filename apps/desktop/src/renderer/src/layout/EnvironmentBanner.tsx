import type { SessionInfo } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

const DOCS_DOCKER_FLATPAK =
  'https://github.com/Karim-Termanini/PersonalProjekte/blob/main/startSH/docs/DOCKER_FLATPAK.md'

export function EnvironmentBanner(): ReactElement {
  const [info, setInfo] = useState<SessionInfo | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const s = (await window.dh.sessionInfo()) as SessionInfo
        setInfo(s)
      } catch {
        setInfo(null)
      }
    })()
  }, [])

  if (!info) {
    return (
      <div
        style={{
          flexShrink: 0,
          padding: '8px 24px',
          fontSize: 12,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        Detecting session…
      </div>
    )
  }

  const label = info.kind === 'flatpak' ? 'Flatpak session' : 'Native / host session'
  const tone = info.kind === 'flatpak' ? 'var(--orange)' : 'var(--green)'

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 24px',
        fontSize: 13,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(124, 77, 255, 0.06)',
      }}
    >
      <span
        className="codicon codicon-shield"
        style={{ color: tone, fontSize: 16 }}
        title={label}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 200 }}>
        <strong style={{ color: 'var(--text)' }}>{label}</strong>
        {info.flatpakId ? (
          <span className="mono" style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>
            {info.flatpakId}
          </span>
        ) : null}
        <div style={{ color: 'var(--text-muted)', marginTop: 4, maxWidth: 900 }}>{info.summary}</div>
      </div>
      <button
        type="button"
        onClick={() => void window.dh.openExternal(DOCS_DOCKER_FLATPAK)}
        style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          color: 'var(--accent)',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Docker &amp; Flatpak notes
      </button>
    </div>
  )
}
