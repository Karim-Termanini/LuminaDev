import type { NetworkRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

import { getNetworkDescription } from './dockerHelpers'

const btnSmallDanger = {
  border: '1px solid var(--orange)',
  background: 'var(--bg-input)',
  color: 'var(--orange)',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 12,
} as const

const nameInput = {
  marginTop: 0,
  width: '100%' as const,
  maxWidth: 320,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
} as const

const systemBadge = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text-muted)',
  background: 'var(--bg)',
  textAlign: 'center' as const,
} as const

export type DockerNetworksTabProps = {
  t: (key: string, options?: Record<string, unknown>) => string
  busy: boolean
  networks: NetworkRow[]
  createNetworkName: string
  setCreateNetworkName: (value: string) => void
  onCreateNetwork: () => Promise<void>
  onRemoveNetwork: (id: string) => Promise<void>
}

export function DockerNetworksTab({
  t,
  busy,
  networks,
  createNetworkName,
  setCreateNetworkName,
  onCreateNetwork,
  onRemoveNetwork,
}: DockerNetworksTabProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('network.create')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={createNetworkName}
            onChange={(e) => setCreateNetworkName(e.target.value)}
            placeholder={t('network.namePlaceholder')}
            style={{ ...nameInput }}
            disabled={busy}
          />
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            onClick={() => void onCreateNetwork()}
            disabled={busy}
          >
            {t('network.create')}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('network.local')}</div>
        {networks.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('network.none')}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {networks.map((n) => (
              <div
                key={n.id}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-all' }}>
                  {n.name}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--text-muted)' }}
                  title={n.id}
                >
                  {n.id.slice(0, 12)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <span>
                    {t('network.driver')}:{' '}
                    <span className="mono" data-ltr>
                      {n.driver}
                    </span>
                  </span>
                  <span>
                    {t('network.scope')}:{' '}
                    <span className="mono" data-ltr>
                      {n.scope}
                    </span>
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {getNetworkDescription(n.name, t)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('network.usedBy')}:{' '}
                  <span className="mono" style={{ fontSize: 11 }}>
                    {n.usedBy && n.usedBy.length > 0
                      ? n.usedBy.join(', ')
                      : t('volume.unused')}
                  </span>
                </div>
                {n.name === 'bridge' || n.name === 'host' || n.name === 'none' ? (
                  <div style={{ ...systemBadge, marginTop: 8 }}>
                    {t('network.protected')}
                  </div>
                ) : (
                  <button
                    type="button"
                    style={{ ...btnSmallDanger, marginTop: 8 }}
                    onClick={() => void onRemoveNetwork(n.id)}
                    disabled={busy}
                  >
                    {t('network.remove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
