import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import type { ProfilesPageViewModel } from '../useProfilesPage'

export function ProfileWizardStep2({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  if (!vm.wizardData) return <></>
  const wizardData = vm.wizardData
  const setWizardData = vm.setWizardData
  return (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
                      {t('wizard.ssh.title')}
                    </h3>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 13,
                        marginBottom: 20,
                        lineHeight: 1.4,
                      }}
                    >
                      {t('wizard.ssh.subtitle')}
                    </p>

                    {/* Explanatory Note Card */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 20,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span className="codicon codicon-info" style={{ color: 'var(--accent)' }} />
                        <span>{t('wizard.ssh.guideTitle')}</span>
                      </div>
                      <Trans i18nKey="wizard.ssh.guideBeginner" t={t} />
                      <br />
                      <Trans i18nKey="wizard.ssh.guideExpert" t={t} />
                      <br />
                      <Trans i18nKey="wizard.ssh.guideSkip" t={t} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 14,
                            fontWeight: 600,
                            marginBottom: 8,
                          }}
                        >
                          {t('wizard.ssh.keyLabel')}
                        </label>
                        <input
                          type="text"
                          value={wizardData.sshKeyId ?? ''}
                          onChange={(e) =>
                            setWizardData({ ...wizardData, sshKeyId: e.target.value || undefined })
                          }
                          placeholder={t('wizard.ssh.keyPlaceholder')}
                          className="fluent-input"
                          style={{ fontFamily: 'monospace', width: '100%' }}
                        />
                        {wizardData.sshKeyId && vm.sshKeyConflict && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: 'rgba(255,180,0,0.08)',
                                border: '1px solid rgba(255,180,0,0.25)',
                              }}
                            >
                              <p
                                style={{
                                  margin: '0 0 8px',
                                  fontSize: 12,
                                  color: 'var(--yellow)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span className="codicon codicon-warning" />
                                {t('wizard.ssh.keyDuplicateWarning', {
                                  name: vm.sshKeyConflict.name,
                                })}
                              </p>
                              <button
                                type="button"
                                className="dev-home-btn"
                                style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                                disabled={vm.isGeneratingSsh}
                                onClick={() => void vm.handleGenerateFreshSshKey()}
                              >
                                {vm.isGeneratingSsh
                                  ? t('wizard.ssh.generating')
                                  : t('wizard.ssh.generateFresh')}
                              </button>
                              {vm.sshGenerateError && (
                                <p style={{ color: 'var(--red)', fontSize: 12, margin: '8px 0 0' }}>
                                  {vm.sshGenerateError}
                                </p>
                              )}
                            </div>
                          )}
                      </div>

                      {/* SSH Helper Actions */}
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.15)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {t('wizard.ssh.helperTools')}
                        </div>

                        {vm.detectingSsh ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {t('wizard.ssh.scanning')}
                          </span>
                        ) : vm.hostSshKey ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                color: 'var(--green)',
                                fontSize: 12,
                              }}
                            >
                              <span className="codicon codicon-check" />
                              <span>{t('wizard.ssh.keyFound')}</span>
                            </div>
                            <button
                              type="button"
                              className="dev-home-btn"
                              style={{
                                alignSelf: 'flex-start',
                                fontSize: 12,
                                padding: '6px 12px',
                                margin: 0,
                              }}
                              onClick={() => setWizardData({ ...wizardData, sshKeyId: 'host' })}
                            >
                              {t('wizard.ssh.useDefault')}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ color: 'var(--yellow)', fontSize: 12 }}>
                              {t('wizard.ssh.noKey')}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="text"
                                value={vm.sshEmail}
                                onChange={(e) => vm.setSshEmail(e.target.value)}
                                placeholder={t('wizard.ssh.emailPlaceholder')}
                                className="fluent-input"
                                style={{ fontSize: 12, padding: '6px 10px', width: '200px' }}
                              />
                              <button
                                type="button"
                                className="dev-home-btn"
                                style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                                disabled={vm.isGeneratingSsh}
                                onClick={async () => {
                                  vm.setIsGeneratingSsh(true)
                                  vm.setSshGenerateError(null)
                                  try {
                                    const res = await window.dh.sshGenerate({
                                      target: 'host',
                                      email: vm.sshEmail.trim(),
                                    })
                                    if (res.ok) {
                                      await vm.detectLocalSshKey()
                                      setWizardData({ ...wizardData, sshKeyId: 'host' })
                                    } else {
                                      vm.setSshGenerateError(
                                        res.error || 'Failed to generate SSH key.'
                                      )
                                    }
                                  } catch (e) {
                                    const err = e as { message?: string } | null
                                    vm.setSshGenerateError((err && err.message) || String(e))
                                  }
                                  vm.setIsGeneratingSsh(false)
                                }}
                              >
                                {vm.isGeneratingSsh
                                  ? t('wizard.ssh.generating')
                                  : t('wizard.ssh.generate')}
                              </button>
                            </div>
                            {vm.sshGenerateError && (
                              <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>
                                {vm.sshGenerateError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

  )
}
