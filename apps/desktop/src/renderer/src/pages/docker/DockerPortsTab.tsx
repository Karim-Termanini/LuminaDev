import type { ContainerRow, NetworkRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

import { extractFirstHostPort } from './dockerHelpers'

interface DockerPortsTabProps {
  t: (key: string, options?: Record<string, unknown>) => string
  rows: ContainerRow[]
  networks: NetworkRow[]
  remapContainerId: string
  setRemapContainerId: (id: string) => void
  remapOldPort: string
  setRemapOldPort: (port: string) => void
  remapNewPort: string
  setRemapNewPort: (port: string) => void
  remapContainerPort: string
  setRemapContainerPort: (port: string) => void
  remapProtocol: 'tcp' | 'udp'
  setRemapProtocol: (protocol: 'tcp' | 'udp') => void
  remapNetworkMode: string
  setRemapNetworkMode: (mode: string) => void
  remapBusy: boolean
  remapFeedback: string | null
  onRemapPort: () => void
}

const tableWrap = {
  width: '100%',
  overflowX: 'auto' as const,
}

const table = {
  width: '100%',
  minWidth: 760,
  borderCollapse: 'collapse' as const,
  fontSize: 13,
  tableLayout: 'fixed' as const,
}

const monoCell = {
  fontSize: 11,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const selectStyle = {
  width: '100%',
  background: '#1e1e1e',
  color: '#e8e8e8',
  border: '1px solid var(--border)',
  height: 38,
  appearance: 'none' as const,
  padding: '0 12px',
}

const selectOptionStyle = { background: '#1e1e1e', color: '#e8e8e8' }

export function DockerPortsTab({
  t,
  rows,
  networks,
  remapContainerId,
  setRemapContainerId,
  remapOldPort,
  setRemapOldPort,
  remapNewPort,
  setRemapNewPort,
  remapContainerPort,
  setRemapContainerPort,
  remapProtocol,
  setRemapProtocol,
  remapNetworkMode,
  setRemapNetworkMode,
  remapBusy,
  remapFeedback,
  onRemapPort,
}: DockerPortsTabProps): ReactElement {
  const remapTargetRow = rows.find((r) => r.id === remapContainerId)
  const remapTargetHasHostBinding = Boolean(
    remapTargetRow && extractFirstHostPort(remapTargetRow.ports)
  )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('ports.listDesc')}</div>
      <div className="hp-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('ports.title')}</div>
        {rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('ports.none')}</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>{t('ports.col.container')}</th>
                  <th>{t('ports.col.state')}</th>
                  <th>{t('ports.col.ports')}</th>
                  <th>{t('ports.col.hostPublish')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 6px', fontWeight: 600 }} data-ltr>
                      {r.name}
                    </td>
                    <td>{t(`common:status.${r.state}`, { defaultValue: r.state })}</td>
                    <td className="mono" style={monoCell} data-ltr title={r.ports}>
                      {r.ports}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {extractFirstHostPort(r.ports) ? (
                        <span style={{ color: 'var(--green)' }}>yes</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>no</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="hp-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('ports.bindings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('ports.remapDesc')}
          </p>
          {rows.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No containers yet.
            </div>
          ) : null}
          {rows.length > 0 ? (
            <>
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
              >
                <span style={{ fontWeight: 600 }}>Container</span>
                <select
                  className="hp-input"
                  value={remapContainerId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setRemapContainerId(nextId)
                    const next = rows.find((r) => r.id === nextId)
                    if (next) setRemapOldPort(extractFirstHostPort(next.ports))
                  }}
                  style={selectStyle}
                >
                  {rows.map((r) => (
                    <option
                      key={r.id}
                      value={r.id}
                      style={selectOptionStyle}
                    >
                      {r.name} ({r.id.slice(0, 12)}) — {r.ports}
                      {extractFirstHostPort(r.ports) ? '' : ' (no host publish in ps)'}
                    </option>
                  ))}
                </select>
              </label>
              {!remapTargetHasHostBinding ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'flex-end',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Container port</span>
                    <input
                      className="hp-input"
                      type="number"
                      min={1}
                      max={65535}
                      value={remapContainerPort}
                      onChange={(e) => setRemapContainerPort(e.target.value)}
                      placeholder="e.g. 80"
                      style={{ width: 100 }}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Host port</span>
                    <input
                      className="hp-input"
                      type="number"
                      min={1}
                      max={65535}
                      value={remapNewPort}
                      onChange={(e) => setRemapNewPort(e.target.value)}
                      placeholder="e.g. 8080"
                      style={{ width: 100 }}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Protocol</span>
                    <select
                      className="hp-input"
                      value={remapProtocol}
                      onChange={(e) => setRemapProtocol(e.target.value as 'tcp' | 'udp')}
                      style={{
                        width: 80,
                        background: '#1e1e1e',
                        color: '#e8e8e8',
                        border: '1px solid var(--border)',
                        height: 38,
                      }}
                    >
                      <option value="tcp">tcp</option>
                      <option value="udp">udp</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    disabled={remapBusy}
                    onClick={() => void onRemapPort()}
                  >
                    {remapBusy ? 'Working…' : 'Add binding'}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'flex-end',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Current host port</span>
                    <input
                      className="hp-input"
                      type="number"
                      min={1}
                      max={65535}
                      placeholder="8080"
                      value={remapOldPort}
                      onChange={(e) => setRemapOldPort(e.target.value)}
                      style={{ width: 120 }}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {t('ports.newHostPort')}{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                        ({t('ports.sameKeepPort')})
                      </span>
                    </span>
                    <input
                      className="hp-input"
                      type="number"
                      min={1}
                      max={65535}
                      placeholder="same or new"
                      value={remapNewPort}
                      onChange={(e) => setRemapNewPort(e.target.value)}
                      style={{ width: 140 }}
                    />
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: 13,
                      minWidth: 180,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Target network</span>
                    <select
                      className="hp-input"
                      value={remapNetworkMode}
                      onChange={(e) => setRemapNetworkMode(e.target.value)}
                    >
                      {networks.map((n) => (
                        <option key={n.name} value={n.name}>
                          {n.name}
                        </option>
                      ))}
                      {networks.length === 0 ? (
                        <option value="bridge">bridge</option>
                      ) : null}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    disabled={remapBusy}
                    onClick={() => void onRemapPort()}
                  >
                    {remapBusy ? t('ports.remapping') : t('ports.remap')}
                  </button>
                </div>
              )}
              {remapFeedback ? (
                <div
                  className={
                    remapFeedback.startsWith('Remap finished')
                      ? 'hp-status-alert success'
                      : 'hp-status-alert warning'
                  }
                  style={{ fontSize: 13 }}
                >
                  {remapFeedback}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
