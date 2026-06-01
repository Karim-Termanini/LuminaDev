import type { ReactElement } from 'react'
import type { RuntimeStatus } from '@linux-dev-home/shared'

interface RuntimeUninstallModalProps {
  runtime: RuntimeStatus
  runtimeId: string
  removeMode: 'runtime_only' | 'runtime_and_deps'
  uninstallPreview: {
    distro: string
    runtimePackages: string[]
    removableDeps: string[]
    blockedSharedDeps: string[]
    finalPackages: string[]
    note?: string
  } | null
  loadingUninstallPreview: boolean
  t: (key: string, options?: Record<string, unknown>) => string
  onClose: () => void
  onSetRemoveMode: (mode: 'runtime_only' | 'runtime_and_deps') => void
  onFetchPreview: (runtimeId: string, mode: 'runtime_only' | 'runtime_and_deps') => void
  onConfirmUninstall: () => void
}

export function RuntimeUninstallModal({
  runtime,
  runtimeId,
  removeMode,
  uninstallPreview,
  loadingUninstallPreview,
  t,
  onClose,
  onSetRemoveMode,
  onFetchPreview,
  onConfirmUninstall,
}: RuntimeUninstallModalProps): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: 'min(760px, 92%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          {t('uninstall.title', { name: runtime.name })}
        </h3>
        <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          {t('uninstall.desc')}
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button
            onClick={() => {
              onSetRemoveMode('runtime_only')
              onFetchPreview(runtimeId, 'runtime_only')
            }}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${removeMode === 'runtime_only' ? 'var(--accent)' : 'var(--border)'}`,
              background:
                removeMode === 'runtime_only' ? 'rgba(124,77,255,0.12)' : 'transparent',
              color: 'var(--text-main)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700 }}>{t('uninstall.runtimeOnly')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('uninstall.runtimeOnlyDesc')}
            </div>
          </button>
          <button
            onClick={() => {
              onSetRemoveMode('runtime_and_deps')
              onFetchPreview(runtimeId, 'runtime_and_deps')
            }}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${removeMode === 'runtime_and_deps' ? 'var(--accent)' : 'var(--border)'}`,
              background:
                removeMode === 'runtime_and_deps' ? 'rgba(124,77,255,0.12)' : 'transparent',
              color: 'var(--text-main)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700 }}>{t('uninstall.fullClean')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('uninstall.fullCleanDesc')}
            </div>
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {loadingUninstallPreview ? (
            <div style={{ color: 'var(--text-muted)' }}>{t('uninstall.previewLoading')}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('uninstall.distro', { distro: uninstallPreview?.distro ?? 'unknown' })}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                {t('uninstall.packagesToRemove')}
              </div>
              {uninstallPreview?.finalPackages.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {uninstallPreview.finalPackages.map((pkg) => (
                    <span
                      key={pkg}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,82,82,0.35)',
                        background: 'rgba(255,82,82,0.12)',
                        fontSize: 12,
                      }}
                    >
                      {pkg}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('uninstall.noPackages')}
                </div>
              )}
              {removeMode === 'runtime_and_deps' &&
                uninstallPreview &&
                uninstallPreview.removableDeps.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('uninstall.extraDeps')} {uninstallPreview.removableDeps.join(', ')}
                  </div>
                )}
              {removeMode === 'runtime_and_deps' &&
                uninstallPreview &&
                uninstallPreview.blockedSharedDeps.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#ffb74d' }}>
                    {t('uninstall.sharedDeps', {
                      deps: uninstallPreview.blockedSharedDeps.join(', '),
                    })}
                  </div>
                )}
              {uninstallPreview?.note && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  {uninstallPreview.note}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="hp-btn" onClick={onClose}>
            {t('uninstall.cancel')}
          </button>
          <button
            className="hp-btn"
            onClick={onConfirmUninstall}
            style={{
              background: 'rgba(255,82,82,0.18)',
              border: '1px solid rgba(255,82,82,0.4)',
              color: '#ff8a80',
              fontWeight: 700,
            }}
          >
            {t('uninstall.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
