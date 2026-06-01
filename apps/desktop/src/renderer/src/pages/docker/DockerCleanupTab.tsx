import type { ReactElement } from 'react'

type PruneSelection = {
  containers: boolean
  images: boolean
  volumes: boolean
  networks: boolean
}

type PrunePreview = {
  containers: number
  images: number
  volumes: number
  networks: number
} | null

interface DockerCleanupTabProps {
  t: (key: string, options?: Record<string, unknown>) => string
  busy: boolean
  pruneSelection: PruneSelection
  setPruneSelection: (
    updater: PruneSelection | ((prev: PruneSelection) => PruneSelection)
  ) => void
  prunePreview: PrunePreview
  onPreviewCleanup: () => void
  onRunPrune: () => void
}

const checkboxLabel = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 16px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'border-color 0.2s',
}

const previewCard = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--bg-input)',
}

const previewLabel = {
  fontSize: 11,
  color: 'var(--text-muted)',
}

const previewValue = {
  fontSize: 22,
  fontWeight: 700,
  marginTop: 4,
}

const btnPrimary = {
  border: '1px solid var(--accent)',
  background: 'var(--bg-input)',
  color: 'var(--accent)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const sectionBox = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 10,
  background: 'var(--bg-input)',
}

export function DockerCleanupTab({
  t,
  busy,
  pruneSelection,
  setPruneSelection,
  prunePreview,
  onPreviewCleanup,
  onRunPrune,
}: DockerCleanupTabProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card">
        <h3 style={{ margin: 0, fontSize: 18 }}>{t('cleanup.title')}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {t('cleanup.freeUpDesc')}
        </p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={pruneSelection.containers}
              onChange={(e) =>
                setPruneSelection((p) => ({ ...p, containers: e.target.checked }))
              }
            />
            <div>
              <div style={{ fontWeight: 600 }}>{t('cleanup.pruneContainers')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('cleanup.pruneContainersDesc')}
              </div>
            </div>
          </label>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={pruneSelection.images}
              onChange={(e) =>
                setPruneSelection((p) => ({ ...p, images: e.target.checked }))
              }
            />
            <div>
              <div style={{ fontWeight: 600 }}>{t('cleanup.pruneImages')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('cleanup.pruneImagesDesc')}
              </div>
            </div>
          </label>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={pruneSelection.volumes}
              onChange={(e) =>
                setPruneSelection((p) => ({ ...p, volumes: e.target.checked }))
              }
            />
            <div>
              <div style={{ fontWeight: 600 }}>{t('cleanup.pruneVolumes')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('cleanup.pruneVolumesDesc')}
              </div>
            </div>
          </label>
          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={pruneSelection.networks}
              onChange={(e) =>
                setPruneSelection((p) => ({ ...p, networks: e.target.checked }))
              }
            />
            <div>
              <div style={{ fontWeight: 600 }}>{t('cleanup.pruneNetworks')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('cleanup.pruneNetworksDesc')}
              </div>
            </div>
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('cleanup.dryRun')}</div>
          {!prunePreview ? (
            <button
              type="button"
              className="hp-btn"
              onClick={() => void onPreviewCleanup()}
              disabled={busy}
            >
              Load preview
            </button>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))',
                gap: 8,
              }}
            >
              <div style={previewCard}>
                <div style={previewLabel}>{t('cleanup.col.containers')}</div>
                <div style={previewValue} data-numeric>
                  {prunePreview.containers}
                </div>
              </div>
              <div style={previewCard}>
                <div style={previewLabel}>{t('cleanup.col.images')}</div>
                <div style={previewValue} data-numeric>
                  {prunePreview.images}
                </div>
              </div>
              <div style={previewCard}>
                <div style={previewLabel}>{t('cleanup.col.volumes')}</div>
                <div style={previewValue} data-numeric>
                  {prunePreview.volumes}
                </div>
              </div>
              <div style={previewCard}>
                <div style={previewLabel}>{t('cleanup.col.networks')}</div>
                <div style={previewValue} data-numeric>
                  {prunePreview.networks}
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          style={{ ...btnPrimary, marginTop: 20, width: '100%', padding: '12px' }}
          onClick={() => void onRunPrune()}
          disabled={busy || !Object.values(pruneSelection).some((v) => v)}
        >
          {t('cleanup.runSelected')}
        </button>
      </div>

      <div style={{ ...sectionBox, border: '1px solid var(--orange)' }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--orange)' }}>
          {t('cleanup.safetyNote')}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('cleanup.safetyNoteDesc')}
        </p>
      </div>
    </div>
  )
}
