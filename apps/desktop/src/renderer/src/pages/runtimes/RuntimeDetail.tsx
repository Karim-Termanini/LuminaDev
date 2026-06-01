import type { ReactElement } from 'react'
import type { RuntimeStatus } from '@linux-dev-home/shared'
import {
  RUNTIME_DETAILS,
  type InstalledVersionRow,
  formatRuntimeVersionDisplay,
  installedVersionLabel,
  installedVersionKey,
} from './helpers'

interface RuntimeDetailProps {
  runtime: RuntimeStatus
  runtimeId: string
  detectedVersions: InstalledVersionRow[]
  loadingInstalledVersions: boolean
  installInProgress: boolean
  isUninstallJob: boolean
  isUpdateJob: boolean
  effectiveUpdateOutcome: 'already_latest' | 'updated' | undefined
  settingActivePath: string | null
  removingVersionPath: string | null
  installedLabel: string
  availableLabel: string
  versionLabel: (v: string) => string
  installVersionLabel: string
  installingLabel: string
  updateCurrentLabel: string
  installLatestLabel: string
  updatingLabel: string
  removeLabel: string
  descriptionLabel: string
  descText: string
  visitWebsiteLabel: string
  detectedLabel: string
  loadingDetectedLabel: string
  activeLabel: string
  switchLabel: string
  switchingLabel: string
  cannotRemoveActiveLabel: string
  removeVersionLabel: (v: string) => string
  removingLabel: string
  onStartInstall: (id: string) => void
  onRunUpdate: () => void
  onOpenUninstallModal: () => void
  onSetActive: (path: string, version?: string) => void
  onRemoveVersion: (version: string, path: string) => void
}

export function RuntimeDetail(props: RuntimeDetailProps): ReactElement {
  const {
    runtime,
    runtimeId,
    detectedVersions,
    loadingInstalledVersions,
    installInProgress,
    isUninstallJob,
    isUpdateJob,
    effectiveUpdateOutcome,
    settingActivePath,
    removingVersionPath,
    installedLabel,
    availableLabel,
    versionLabel,
    installVersionLabel,
    installingLabel,
    updateCurrentLabel,
    installLatestLabel,
    updatingLabel,
    removeLabel,
    descriptionLabel,
    descText,
    visitWebsiteLabel,
    detectedLabel,
    loadingDetectedLabel,
    activeLabel,
    switchLabel,
    switchingLabel,
    cannotRemoveActiveLabel,
    removeVersionLabel,
    removingLabel,
    onStartInstall,
    onRunUpdate,
    onOpenUninstallModal,
    onSetActive,
    onRemoveVersion,
  } = props

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
            <span
              className={`codicon codicon-${RUNTIME_DETAILS[runtimeId]?.icon || 'code'}`}
            />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>{runtime.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: runtime.installed
                    ? 'rgba(0, 230, 118, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: runtime.installed ? 'var(--green)' : 'var(--text-muted)',
                  border: `1px solid ${runtime.installed ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                {runtime.installed ? installedLabel : availableLabel}
              </span>
              {runtime.installed && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {versionLabel(formatRuntimeVersionDisplay(runtimeId, runtime.version))}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => onStartInstall(runtimeId)}
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
              ? installingLabel
              : installVersionLabel}
          </button>

          {runtime.installed && (
            <>
              <button
                onClick={onRunUpdate}
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
                  ? updatingLabel
                  : effectiveUpdateOutcome === 'already_latest'
                    ? installLatestLabel
                    : updateCurrentLabel}
              </button>
              <button
                onClick={onOpenUninstallModal}
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
                {removeLabel}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 48 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{descriptionLabel}</h3>
        <p style={{ fontSize: 16, color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.8 }}>
          {descText}
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            window.dh.openExternal(RUNTIME_DETAILS[runtimeId]?.website || '')
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
          {visitWebsiteLabel}
        </a>
      </div>

      {runtime.installed && detectedVersions.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{detectedLabel}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadingInstalledVersions ? (
              <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <span
                  className="codicon codicon-loading codicon-modifier-spin"
                  style={{ marginRight: 6 }}
                />
                {loadingDetectedLabel}
              </div>
            ) : (
              detectedVersions.map((v) => {
                const rowKey = installedVersionKey(v)
                const displayLabel = installedVersionLabel(runtimeId, v)
                const isActive = v.isDefault === true
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
                        {runtimeId === 'java' && v.label
                          ? v.label
                          : versionLabel(displayLabel)}
                      </div>
                      {runtimeId === 'java' && (
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
                      {runtimeId !== 'java' && (
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
                      {runtimeId === 'java' && (
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
                          {activeLabel}
                        </span>
                      )}
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => onSetActive(v.path, v.version)}
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
                          {settingActivePath === rowKey ? switchingLabel : switchLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveVersion(v.version, v.path)}
                        disabled={
                          installInProgress || removingVersionPath === rowKey || isActive
                        }
                        title={
                          isActive
                            ? cannotRemoveActiveLabel
                            : removeVersionLabel(displayLabel)
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
                        {removingVersionPath === rowKey ? removingLabel : removeLabel}
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
