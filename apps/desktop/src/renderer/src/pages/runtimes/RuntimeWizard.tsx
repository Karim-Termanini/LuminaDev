import type { ReactElement } from 'react'
import type { RuntimeStatus, JobSummary } from '@linux-dev-home/shared'

interface RuntimeWizardProps {
  runtime: RuntimeStatus | undefined
  runtimeId: string
  wizardSteps: Array<{ step: number; label: string }>
  wizardStep: number
  installMethod: 'system' | 'local'
  selectedVersion: string
  availableVersions: string[]
  versionsLoading: boolean
  addToPath: boolean
  dependencies: Array<{ name: string; status: string; ok: boolean }>
  activeJob: JobSummary | undefined
  isUninstallJob: boolean
  isUpdateJob: boolean
  isSystemOnlyRuntime: boolean
  supportsLocalInstall: boolean
  systemHasRealVersionChoice: boolean
  progressAction: string
  suggestVerifyCmd: string
  logHasVerifyOk: boolean
  logHasVerifyFail: boolean
  t: (key: string, options?: Record<string, unknown>) => string
  onClose: () => void
  onSetInstallMethod: (method: 'system' | 'local') => void
  onSetSelectedVersion: (version: string) => void
  onSetAddToPath: (checked: boolean) => void
  onRefreshVersions: (resetDefault: boolean) => void
  onSetWizardStep: (step: number) => void
  onRunInstall: () => void
  onCancelInstall: () => void
  onInstallDeps: (runtimeId: string) => void
}

export function RuntimeWizard(props: RuntimeWizardProps): ReactElement {
  const {
    runtime,
    runtimeId,
    wizardSteps,
    wizardStep,
    installMethod,
    selectedVersion,
    availableVersions,
    versionsLoading,
    addToPath,
    dependencies,
    activeJob,
    isUninstallJob,
    isUpdateJob,
    isSystemOnlyRuntime,
    supportsLocalInstall,
    systemHasRealVersionChoice,
    progressAction,
    suggestVerifyCmd,
    logHasVerifyOk,
    logHasVerifyFail,
    t,
    onClose,
    onSetInstallMethod,
    onSetSelectedVersion,
    onSetAddToPath,
    onRefreshVersions,
    onSetWizardStep,
    onRunInstall,
    onCancelInstall,
    onInstallDeps,
  } = props

  return (
    <div style={{ padding: 40, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <span className="codicon codicon-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          {t('wizard.setup', { name: runtime?.name })}
        </h2>
      </div>

      <div
        style={{
          flex: 1,
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Stepper Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {wizardSteps.map((s, idx) => {
            const isLast = idx === wizardSteps.length - 1
            const isStepComplete = wizardStep > s.step || (wizardStep === s.step && isLast)
            const displayStep = idx + 1
            return (
              <div
                key={s.step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: wizardStep >= s.step ? 1 : 0.3,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: isStepComplete
                      ? 'var(--green)'
                      : wizardStep === s.step
                        ? 'var(--accent)'
                        : 'var(--border)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {isStepComplete ? '✔' : displayStep}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* Step Content */}
        <div style={{ flex: 1, padding: 40, overflowY: 'auto' }}>
          {wizardStep === 1 && (
            <div>
              <h3 style={{ marginTop: 0 }}>{t('wizConfig.title')}</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
                {t('wizConfig.desc', { name: runtime?.name })}
              </p>

              {!supportsLocalInstall && (
                <div
                  className="hp-card"
                  style={{
                    marginBottom: 20,
                    padding: '14px 16px',
                    borderColor: 'var(--accent)',
                    background: 'rgba(124, 77, 255, 0.08)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {t('wizConfig.systemOnlyTipTitle')}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('wizConfig.systemOnlyTip', { name: runtime?.name })}
                  </div>
                  {isSystemOnlyRuntime && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 8,
                        lineHeight: 1.45,
                      }}
                    >
                      {t('wizConfig.systemOnlySkipDeps')}
                    </div>
                  )}
                </div>
              )}

              <div className="hp-card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>
                  {t('wizConfig.method')}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => onSetInstallMethod('system')}
                    style={{
                      flex: 1,
                      padding: 16,
                      borderRadius: 12,
                      border: `2px solid ${installMethod === 'system' ? 'var(--accent)' : 'var(--border)'}`,
                      background:
                        installMethod === 'system'
                          ? 'rgba(124, 77, 255, 0.1)'
                          : 'transparent',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {t('wizConfig.system')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t('wizConfig.systemDesc')}
                    </div>
                  </button>
                  {supportsLocalInstall && (
                    <button
                      onClick={() => onSetInstallMethod('local')}
                      style={{
                        flex: 1,
                        padding: 16,
                        borderRadius: 12,
                        border: `2px solid ${installMethod === 'local' ? 'var(--accent)' : 'var(--border)'}`,
                        background:
                          installMethod === 'local' ? 'rgba(124, 77, 255, 0.1)' : 'transparent',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {t('wizConfig.local')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {t('wizConfig.localDesc')}
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div className="hp-card" style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    gap: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {t(
                      installMethod === 'system' && !systemHasRealVersionChoice
                        ? 'wizConfig.repoTrack'
                        : 'wizConfig.targetVersion'
                    )}
                  </div>
                  <button
                    type="button"
                    className="hp-btn-icon"
                    title={t('wizConfig.refreshTitle')}
                    disabled={versionsLoading}
                    onClick={() => void onRefreshVersions(false)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text-muted)',
                      cursor: versionsLoading ? 'default' : 'pointer',
                      opacity: versionsLoading ? 0.65 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      className={`codicon ${versionsLoading ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
                    />
                    {t('wizConfig.refresh')}
                  </button>
                </div>
                <select
                  className="hp-input"
                  style={{
                    width: '100%',
                    opacity: versionsLoading && availableVersions.length === 0 ? 0.6 : 1,
                  }}
                  value={selectedVersion}
                  disabled={
                    (versionsLoading && availableVersions.length === 0) ||
                    (installMethod === 'system' && !systemHasRealVersionChoice)
                  }
                  onChange={(e) => onSetSelectedVersion(e.target.value)}
                >
                  {availableVersions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {t('wizConfig.apiNote')}
                </div>
                {runtimeId === 'java' && installMethod === 'system' && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {t('wizConfig.systemNote')}
                  </div>
                )}
                {installMethod === 'system' && runtimeId !== 'java' && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {t('wizConfig.systemModeNote')}
                  </div>
                )}
                {installMethod === 'system' && supportsLocalInstall && (
                  <div
                    role="note"
                    style={{
                      marginTop: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(255, 183, 77, 0.45)',
                      background: 'rgba(255, 183, 77, 0.1)',
                      fontSize: 12,
                      color: 'var(--text-main)',
                      lineHeight: 1.45,
                    }}
                  >
                    {t('wizConfig.methodNote')}
                  </div>
                )}
              </div>

              <div className="hp-card">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={addToPath}
                    onChange={(e) => onSetAddToPath(e.target.checked)}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{t('wizConfig.addToPath')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('wizConfig.addToPathDesc')}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {wizardStep === 2 && !isSystemOnlyRuntime && (
            <div>
              <h3 style={{ marginTop: 0 }}>{t('wizDeps.title')}</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
                {t('wizDeps.desc', { name: runtime?.name })}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dependencies.length > 0 ? (
                  dependencies.map((d, idx) => {
                    const isInstalling =
                      activeJob?.kind === 'install_deps' && activeJob?.state === 'running'
                    const totalDeps = dependencies.length
                    const depProgressWeight = 100 / totalDeps
                    const currentDepIdx = Math.floor(
                      (activeJob?.progress || 0) / depProgressWeight
                    )
                    const isCurrent = isInstalling && currentDepIdx === idx
                    const isFinished = isInstalling && currentDepIdx > idx

                    // Calculate sub-progress for current item
                    const itemSubProgress = isCurrent
                      ? ((activeJob?.progress || 0) % depProgressWeight) *
                        (100 / depProgressWeight)
                      : isFinished
                        ? 100
                        : 0

                    return (
                      <div
                        key={d.name}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          padding: '12px 16px',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}
                      >
                        {/* Background progress bar */}
                        {(isCurrent || isFinished) && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              height: 3,
                              width: `${itemSubProgress}%`,
                              background: isFinished ? 'var(--green)' : 'var(--accent)',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        )}

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            position: 'relative',
                            zIndex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {d.name}
                            {isCurrent && (
                              <span
                                className="codicon codicon-loading codicon-modifier-spin"
                                style={{ fontSize: 12, color: 'var(--accent)' }}
                              />
                            )}
                            {isFinished && (
                              <span
                                className="codicon codicon-pass"
                                style={{ fontSize: 12, color: 'var(--green)' }}
                              />
                            )}
                          </span>
                          <span
                            style={{
                              color: d.ok || isFinished ? 'var(--green)' : 'var(--orange)',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {isFinished
                              ? t('page.installed')
                              : isCurrent
                                ? t('view.installing')
                                : d.status}
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>
                    {t('wizDeps.checking')}
                  </div>
                )}
              </div>

              {!runtime?.installed && (
                <div
                  style={{
                    marginTop: 24,
                    padding: 16,
                    background: 'rgba(255, 152, 0, 0.1)',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 152, 0, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 13 }}>{t('wizDeps.headerNote')}</div>
                  <button
                    onClick={() => onInstallDeps(runtimeId)}
                    className="hp-btn"
                    style={{
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {t('wizDeps.fixBtn')}
                  </button>
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {t('wizProgress.title', {
                    action: progressAction,
                    name: runtime?.name,
                  })}
                </h3>
                {activeJob?.state === 'running' && (
                  <button
                    onClick={onCancelInstall}
                    style={{
                      background: 'rgba(255, 82, 82, 0.1)',
                      color: '#ff5252',
                      border: '1px solid rgba(255, 82, 82, 0.2)',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('wizProgress.cancel')}
                  </button>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)' }}>
                {t(
                  isUninstallJob
                    ? 'wizProgress.pleaseWaitRemove'
                    : isUpdateJob
                      ? 'wizProgress.pleaseWaitUpdate'
                      : 'wizProgress.pleaseWaitInstall'
                )}
              </p>

              <div style={{ marginTop: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {activeJob?.progress === 100
                      ? t('wizProgress.verifyStep')
                      : t(
                          isUninstallJob
                            ? 'wizProgress.removeStep'
                            : isUpdateJob
                              ? 'wizProgress.updateStep'
                              : 'wizProgress.installStep'
                        )}
                  </span>
                  <span className="mono">{activeJob?.progress || 0}%</span>
                </div>
                <div
                  style={{
                    height: 10,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 5,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${activeJob?.progress || 0}%`,
                      height: '100%',
                      background: 'var(--accent)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 32,
                  flex: 1,
                  background: 'black',
                  padding: 20,
                  borderRadius: 12,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  overflowY: 'auto',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {activeJob?.logTail.map((l, i) => {
                  const lc = l.toLowerCase()
                  const color =
                    l.startsWith('[ERR]') || l.includes('VERIFY FAIL:')
                      ? '#ff5252'
                      : lc.includes('verify ok:')
                        ? '#69f0ae'
                        : '#eee'
                  return (
                    <div key={i} style={{ color, marginBottom: 4 }}>
                      {l}
                    </div>
                  )
                })}
                {activeJob?.state === 'completed' && !logHasVerifyFail && (
                  <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 10 }}>
                    {t('wizProgress.jobOk')}
                  </div>
                )}
                {activeJob?.state === 'completed' && logHasVerifyFail && (
                  <div style={{ color: '#ff8a65', fontWeight: 700, marginTop: 10 }}>
                    {t('wizProgress.jobWarn')}
                  </div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background:
                    activeJob?.state === 'failed' ? 'rgba(255,82,82,0.85)' : 'var(--green)',
                  margin: '0 auto 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                  color: 'white',
                }}
              >
                {activeJob?.state === 'failed' ? '✗' : '✔'}
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800 }}>
                {activeJob?.state === 'failed'
                  ? t('wizFinish.failed')
                  : t('wizFinish.completed')}
              </h2>
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 16,
                  maxWidth: 460,
                  margin: '16px auto 40px',
                }}
              >
                {t(
                  isSystemOnlyRuntime ? 'wizFinish.reviewLogSystemOnly' : 'wizFinish.reviewLog'
                )}
                {logHasVerifyOk && (
                  <span
                    style={{
                      color: 'var(--green)',
                      display: 'block',
                      marginTop: 8,
                      fontSize: 14,
                    }}
                  >
                    <span
                      className="codicon codicon-pass"
                      style={{ verticalAlign: 'middle', marginRight: 6 }}
                    />
                    {t('wizFinish.verifyOk')}
                  </span>
                )}
                {!logHasVerifyOk && !logHasVerifyFail && activeJob?.state === 'completed' && (
                  <span
                    style={{
                      color: 'var(--orange)',
                      display: 'block',
                      marginTop: 8,
                      fontSize: 14,
                    }}
                  >
                    <span
                      className="codicon codicon-warning"
                      style={{ verticalAlign: 'middle', marginRight: 6 }}
                    />
                    {t('wizFinish.verifyRetry')}
                  </span>
                )}
                {logHasVerifyFail && (
                  <span
                    style={{ color: '#ff8a65', display: 'block', marginTop: 8, fontSize: 14 }}
                  >
                    <span
                      className="codicon codicon-error"
                      style={{ verticalAlign: 'middle', marginRight: 6 }}
                    />
                    {t('wizFinish.verifyFail')}
                  </span>
                )}
                {installMethod === 'system' &&
                  activeJob?.state === 'completed' &&
                  ['node', 'python', 'go'].includes(runtimeId) && (
                    <span
                      style={{
                        display: 'block',
                        marginTop: 10,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('wizFinish.systemNote')}
                    </span>
                  )}
              </p>

              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: 20,
                  borderRadius: 12,
                  display: 'inline-block',
                  textAlign: 'left',
                  minWidth: 300,
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('wizFinish.nextSteps')}
                </div>
                <div
                  style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <span>{t('wizFinish.stepRestart')}</span>
                  <span>{t('wizFinish.stepVerify', { cmd: suggestVerifyCmd })}</span>
                  <span>{t('wizFinish.stepBuild')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stepper Footer */}
        <div
          style={{
            padding: '20px 32px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            background: 'rgba(0,0,0,0.1)',
          }}
        >
          {wizardStep < 3 && (
            <button className="hp-btn" onClick={onClose}>
              {t('wizard.cancel')}
            </button>
          )}
          {wizardStep === 1 && (
            <button
              className="hp-btn hp-btn-primary"
              onClick={() => (isSystemOnlyRuntime ? void onRunInstall() : onSetWizardStep(2))}
            >
              {isSystemOnlyRuntime ? t('wizard.installNow') : t('wizard.next')}
            </button>
          )}
          {wizardStep === 2 && !isSystemOnlyRuntime && (
            <button className="hp-btn hp-btn-primary" onClick={onRunInstall}>
              {t('wizard.installNow')}
            </button>
          )}
          {wizardStep === 3 &&
            (activeJob?.state === 'completed' || activeJob?.state === 'failed') && (
              <button className="hp-btn hp-btn-primary" onClick={() => onSetWizardStep(4)}>
                {t('wizard.next')}
              </button>
            )}
          {wizardStep === 4 && (
            <button className="hp-btn hp-btn-primary" onClick={onClose}>
              {t('wizard.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
