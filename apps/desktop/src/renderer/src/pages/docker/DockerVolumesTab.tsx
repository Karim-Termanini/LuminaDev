import type { VolumeRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

import { truncateMiddle, getVolumeDescription } from './dockerHelpers'

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

export type DockerVolumesTabProps = {
  t: (key: string, options?: Record<string, unknown>) => string
  busy: boolean
  volumes: VolumeRow[]
  createVolumeName: string
  setCreateVolumeName: (value: string) => void
  onCreateVolume: () => Promise<void>
  onRemoveVolume: (name: string) => Promise<void>
}

export function DockerVolumesTab({
  t,
  busy,
  volumes,
  createVolumeName,
  setCreateVolumeName,
  onCreateVolume,
  onRemoveVolume,
}: DockerVolumesTabProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('volume.create')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={createVolumeName}
            onChange={(e) => setCreateVolumeName(e.target.value)}
            placeholder={t('volume.namePlaceholder')}
            style={{ ...nameInput }}
            disabled={busy}
          />
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            onClick={() => void onCreateVolume()}
            disabled={busy}
          >
            {t('volume.create')}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('volume.local')}</div>
        {volumes.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('volume.none')}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {volumes.map((v) => (
              <div
                key={v.name}
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
                <div
                  className="mono"
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    wordBreak: 'break-all',
                    color: 'var(--accent)',
                  }}
                  title={v.name}
                >
                  {v.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <span>
                    {t('volume.driver')}:{' '}
                    <span className="mono" data-ltr>
                      {v.driver}
                    </span>
                  </span>
                  <span>
                    {t('volume.scope')}:{' '}
                    <span className="mono" data-ltr>
                      {v.scope}
                    </span>
                  </span>
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    background: 'var(--bg)',
                    padding: '6px 8px',
                    borderRadius: 6,
                    wordBreak: 'break-all',
                  }}
                  title={v.mountpoint}
                >
                  {truncateMiddle(v.mountpoint, 60)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {getVolumeDescription(v.name, !!(v.usedBy && v.usedBy.length > 0), t)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('volume.usedBy')}:{' '}
                  <span className="mono" style={{ fontSize: 11 }}>
                    {v.usedBy && v.usedBy.length > 0
                      ? v.usedBy.join(', ')
                      : t('volume.unused')}
                  </span>
                </div>
                <button
                  type="button"
                  style={{ ...btnSmallDanger, marginTop: 8 }}
                  onClick={() => void onRemoveVolume(v.name)}
                  disabled={busy}
                >
                  {t('volume.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
