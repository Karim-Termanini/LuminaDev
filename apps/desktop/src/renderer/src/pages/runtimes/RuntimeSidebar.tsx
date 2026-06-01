import type { ReactElement } from 'react'
import type { RuntimeStatus } from '@linux-dev-home/shared'
import { RUNTIME_DETAILS, formatRuntimeVersionDisplay } from './helpers'

interface RuntimeSidebarProps {
  runtimes: RuntimeStatus[]
  selectedId: string
  isRefreshing: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
  sidebarTitle: string
  refreshTitle: string
  notInstalledLabel: string
}

export function RuntimeSidebar(props: RuntimeSidebarProps): ReactElement {
  const {
    runtimes,
    selectedId,
    isRefreshing,
    onSelect,
    onRefresh,
    sidebarTitle,
    refreshTitle,
    notInstalledLabel,
  } = props

  return (
    <aside
      style={{
        width: 280,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.1)',
      }}
    >
      <div
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
          }}
        >
          {sidebarTitle}
        </div>
        <button
          onClick={onRefresh}
          className="hp-btn-icon"
          title={refreshTitle}
          disabled={isRefreshing}
          style={{
            padding: 4,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: isRefreshing ? 'default' : 'pointer',
            opacity: isRefreshing ? 0.65 : 1,
          }}
        >
          <span
            className={`codicon ${isRefreshing ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
          />
        </button>
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {runtimes.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              border: 'none',
              background: selectedId === r.id ? 'rgba(124, 77, 255, 0.15)' : 'transparent',
              color: selectedId === r.id ? 'var(--accent)' : 'var(--text-main)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <span
              className={`codicon codicon-${RUNTIME_DETAILS[r.id]?.icon || 'code'}`}
              style={{ fontSize: 18 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {r.installed
                  ? formatRuntimeVersionDisplay(r.id, r.version)
                  : notInstalledLabel}
              </div>
            </div>
            {r.installed && (
              <span
                className="codicon codicon-check"
                style={{ color: 'var(--green)', fontSize: 12 }}
              />
            )}
          </button>
        ))}
      </nav>
    </aside>
  )
}
