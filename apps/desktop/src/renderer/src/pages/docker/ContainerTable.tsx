import type { ContainerRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type ContainerTableProps = {
  title: string
  rows: ContainerRow[]
  busy: boolean
  onAction: (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<void>
  onConfigure: (row: ContainerRow) => void
}

export function ContainerTable(
  props: ContainerTableProps & { onConsole: (row: ContainerRow) => void }
): ReactElement {
  const { title, rows, busy, onAction, onConsole, onConfigure } = props
  const { t } = useTranslation('docker')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!openMenuId) return
    const handler = () => setOpenMenuId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId])
  return (
    <div>
      <div className="hp-section-title">{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('container.noneInGroup')}</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: 16,
          }}
        >
          {rows.map((r) => {
            const isRunning = r.state.toLowerCase() === 'running'
            return (
              <div
                key={r.id}
                className="hp-card"
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      flexShrink: 0,
                      marginTop: 4,
                      background: isRunning ? 'var(--green)' : 'var(--text-muted)',
                    }}
                    title={r.state}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={r.name}
                    >
                      {r.name}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={r.image}
                    >
                      {r.image}
                    </div>
                  </div>
                </div>
                {r.ports !== '—' && (
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      background: 'var(--bg)',
                      padding: '6px 8px',
                      borderRadius: 6,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 8px',
                    }}
                    title={r.ports}
                  >
                    {r.ports.split(',').map((p: string, idx: number) => {
                      const part = p.trim()
                      const hostPortMatch = part.match(/:(\d+)->/)
                      if (hostPortMatch && isRunning) {
                        const hp = hostPortMatch[1]
                        return (
                          <a
                            key={idx}
                            href={`http://localhost:${hp}`}
                            onClick={(e) => {
                              e.preventDefault()
                              void window.dh.openExternal(`http://localhost:${hp}`)
                            }}
                            style={{
                              color: 'var(--accent)',
                              textDecoration: 'none',
                              borderBottom: '1px dashed var(--accent)',
                            }}
                          >
                            {part}
                          </a>
                        )
                      }
                      return <span key={idx}>{part}</span>
                    })}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    gap: 8,
                    paddingTop: 4,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => void onAction(r.id, isRunning ? 'stop' : 'start')}
                    disabled={busy}
                  >
                    {isRunning ? t('action.stop') : t('action.start')}
                  </button>
                  {isRunning && (
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => void onAction(r.id, 'restart')}
                      disabled={busy}
                    >
                      {t('action.restart')}
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => onConsole(r)}
                      disabled={busy}
                    >
                      {t('action.console')}
                    </button>
                  )}
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === r.id ? null : r.id)
                      }}
                      disabled={busy}
                      title={t('action.more')}
                      style={{ minWidth: 36, padding: '6px 10px' }}
                    >
                      ⋮
                    </button>
                    {openMenuId === r.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: 4,
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                          zIndex: 100,
                          minWidth: 160,
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null)
                            onConfigure(r)
                          }}
                          disabled={busy}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 14px',
                            border: 'none',
                            background: 'none',
                            color: 'var(--text)',
                            fontSize: 13,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          {t('action.configure')}
                        </button>
                        {!isRunning && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null)
                              void onAction(r.id, 'remove')
                            }}
                            disabled={busy}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 14px',
                              border: 'none',
                              background: 'none',
                              color: 'var(--red)',
                              fontSize: 13,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              opacity: busy ? 0.5 : 1,
                            }}
                          >
                            {t('action.remove')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
