import type { ReactElement } from 'react'
import type { RuntimeStatus } from '@linux-dev-home/shared'
import { RUNTIME_DETAILS } from './constants'
import {
  formatRuntimeVersionDisplay,
  installedVersionKey,
  installedVersionLabel,
  javaRowSupportsSetActive,
} from './utils'
import type { RuntimesPageViewModel } from './useRuntimesPage'

export interface RuntimeDetailPanelProps {
  vm: RuntimesPageViewModel
  selectedRuntime: RuntimeStatus
}

export function RuntimeDetailPanel({
  vm,
  selectedRuntime,
}: RuntimeDetailPanelProps): ReactElement {
  const {
    t,
    selectedId,
    installInProgress,
    isUninstallJob,
    isUpdateJob,
    effectiveUpdateOutcome,
    detectedVersions,
    loadingInstalledVersions,
    settingActivePath,
    removingVersionPath,
    startInstall,
    runUpdate,
    openUninstallModal,
    setRuntimeActive,
    removeVersion,
  } = vm

  const activeDetected = detectedVersions.find((v) => v.isDefault === true)
  const headerVersionText = activeDetected
    ? formatRuntimeVersionDisplay(selectedId, activeDetected.version)
    : formatRuntimeVersionDisplay(selectedId, selectedRuntime.version)

  return (
    <div style={{ padding: 40, maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'rgba(124, 77, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: 'var(--accent)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}
          >
            <span className={`codicon codicon-${RUNTIME_DETAILS[selectedId]?.icon || 'code'}`} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>{selectedRuntime.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: selectedRuntime.installed
                    ? 'rgba(0, 230, 118, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: selectedRuntime.installed ? 'var(--green)' : 'var(--text-muted)',
                  border: `1px solid ${selectedRuntime.installed ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                {selectedRuntime.installed ? t('page.installed') : t('page.available')}
              </span>
              {selectedRuntime.installed && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {t('page.version', {
                    v: headerVersionText,
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => startInstall(selectedId)}
            disabled={installInProgress}
            style={{
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              fontWeight: 700,
              cursor: installInProgress ? 'default' : 'pointer',
              opacity: installInProgress ? 0.6 : 1,
              boxShadow: '0 4px 15px rgba(124, 77, 255, 0.3)',
            }}
          >
            {installInProgress && !isUninstallJob && !isUpdateJob
              ? t('view.installing')
              : t('view.installVersion')}
          </button>

          {selectedRuntime.installed && (
            <>
              <button
                onClick={() => void runUpdate()}
                disabled={installInProgress}
                style={{
                  padding: '12px 20px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background:
                    effectiveUpdateOutcome === 'already_latest'
                      ? 'rgba(255, 193, 7, 0.1)'
                      : effectiveUpdateOutcome === 'updated'
                        ? 'rgba(0, 230, 118, 0.1)'
                        : 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontWeight: 700,
                  cursor: installInProgress ? 'default' : 'pointer',
                  opacity: installInProgress ? 0.6 : 1,
                }}
              >
                {isUpdateJob
                  ? t('view.updating')
                  : effectiveUpdateOutcome === 'already_latest'
                    ? t('view.installLatest')
                    : t('view.updateCurrent')}
              </button>
              <button
                onClick={() => void openUninstallModal()}
                disabled={installInProgress}
                style={{
                  padding: '12px 20px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,82,82,0.35)',
                  background: 'rgba(255,82,82,0.1)',
                  color: '#ff8a80',
                  fontWeight: 700,
                  cursor: installInProgress ? 'default' : 'pointer',
                  opacity: installInProgress ? 0.5 : 1,
                }}
              >
                {t('view.remove')}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 48 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t('view.description')}</h3>
        <p style={{ fontSize: 16, color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.8 }}>
          {t(selectedId + '.desc')}
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            window.dh.openExternal(RUNTIME_DETAILS[selectedId]?.website || '')
          }}
          style={{
            color: 'var(--accent)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            marginTop: 12,
            display: 'inline-block',
          }}
        >
          {t('view.visitWebsite')}
        </a>
      </div>

      {selectedRuntime.installed && detectedVersions.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t('view.detected')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadingInstalledVersions ? (
              <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <span
                  className="codicon codicon-loading codicon-modifier-spin"
                  style={{ marginRight: 6 }}
                />
                {t('view.loadingDetected')}
              </div>
            ) : (
              detectedVersions.map((v) => {
                const rowKey = installedVersionKey(v)
                const displayLabel = installedVersionLabel(selectedId, v)
                const isActive = v.isDefault === true
                const isSystemDefault = v.isSystemDefault === true
                const canSetActive =
                  selectedId !== 'java' || javaRowSupportsSetActive(v.path)
                return (
                  <div
                    key={rowKey}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {selectedId === 'java' && v.label
                          ? v.label
                          : t('page.version', { v: displayLabel })}
                      </div>
                      {selectedId === 'java' && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                            fontFamily: 'monospace',
                          }}
                        >
                          JAVA_HOME={v.javaHome ?? v.path.replace(/\/bin\/java$/, '')}
                        </div>
                      )}
                      {selectedId !== 'java' && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                            fontFamily: 'monospace',
                          }}
                        >
                          {v.path}
                        </div>
                      )}
                      {selectedId === 'java' && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                            fontFamily: 'monospace',
                            opacity: 0.75,
                          }}
                        >
                          {v.path}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: 'var(--green)',
                            padding: '2px 8px',
                            borderRadius: 10,
                            border: '1px solid rgba(0,230,118,0.3)',
                            background: 'rgba(0,230,118,0.05)',
                          }}
                        >
                          {t('page.active')}
                        </span>
                      )}
                      {!isActive && isSystemDefault && selectedId === 'java' && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: 'var(--accent)',
                            padding: '2px 8px',
                            borderRadius: 10,
                            border: '1px solid rgba(124, 77, 255, 0.35)',
                            background: 'rgba(124, 77, 255, 0.08)',
                          }}
                        >
                          {t('page.systemDefault')}
                        </span>
                      )}
                      {!isActive && canSetActive && (
                        <button
                          type="button"
                          onClick={() => void setRuntimeActive(v.path, v.version)}
                          disabled={installInProgress || settingActivePath === rowKey}
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '6px 10px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text-main)',
                            cursor:
                              installInProgress || settingActivePath === rowKey
                                ? 'default'
                                : 'pointer',
                            opacity:
                              installInProgress || settingActivePath === rowKey ? 0.55 : 1,
                          }}
                        >
                          {settingActivePath === rowKey
                            ? t('view.switching')
                            : t('view.switch')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeVersion(v.version, v.path)}
                        disabled={
                          installInProgress || removingVersionPath === rowKey || isActive
                        }
                        title={
                          isActive
                            ? t('view.cannotRemoveActive')
                            : t('page.removeVersion', { v: displayLabel })
                        }
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,82,82,0.3)',
                          background: 'rgba(255,82,82,0.08)',
                          color: isActive ? 'var(--text-muted)' : '#ff5252',
                          cursor:
                            installInProgress || removingVersionPath === rowKey || isActive
                              ? 'default'
                              : 'pointer',
                          opacity:
                            installInProgress || removingVersionPath === rowKey || isActive
                              ? 0.4
                              : 1,
                        }}
                      >
                        {removingVersionPath === rowKey ? t('view.removing') : t('view.remove')}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
