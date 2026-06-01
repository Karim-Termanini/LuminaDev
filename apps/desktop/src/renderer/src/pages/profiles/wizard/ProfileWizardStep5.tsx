import type { ReactElement } from 'react'
import type { ProfilesPageViewModel } from '../useProfilesPage'

export function ProfileWizardStep5({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  if (!vm.wizardData) return <></>
  const wizardData = vm.wizardData
  return (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
                      {t('wizard.review.title')}
                    </h3>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 13,
                        marginBottom: 24,
                        lineHeight: 1.4,
                      }}
                    >
                      {t('wizard.review.subtitle')}
                    </p>

                    <div
                      style={{
                        background: 'rgba(0,0,0,0.15)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.profileName')}</span>
                        <span>{wizardData.name}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.baseTemplate')}</span>
                        <span>{wizardData.baseTemplate}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.sshKey')}</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {wizardData.sshKeyId || t('wizard.review.systemDefault')}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.composeStack')}</span>
                        <span
                          style={{
                            textTransform: 'uppercase',
                            fontSize: 12,
                            fontWeight: 700,
                            color:
                              (wizardData.composeVariant ?? 'stub') === 'full'
                                ? 'var(--accent)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {wizardData.composeVariant ?? 'stub'}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.description')}</span>
                        <span
                          style={{
                            color: wizardData.description ? 'var(--text)' : 'var(--text-muted)',
                            fontStyle: wizardData.description ? 'normal' : 'italic',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {wizardData.description || t('wizard.review.none')}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.tags')}</span>
                        <span
                          style={{
                            color:
                              (wizardData.tags ?? []).length > 0
                                ? 'var(--text)'
                                : 'var(--text-muted)',
                            fontStyle: (wizardData.tags ?? []).length > 0 ? 'normal' : 'italic',
                          }}
                        >
                          {(wizardData.tags ?? []).length > 0
                            ? (wizardData.tags ?? []).join(', ')
                            : t('wizard.review.none')}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{t('wizard.review.envVars')}</span>
                        <span>
                          {t('wizard.review.variableCount', {
                            count: (wizardData.envVars || []).length,
                          })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>
                          {t('wizard.review.linkedCredentials')}
                        </span>
                        <span>
                          {t('wizard.review.secretCount', {
                            count: (wizardData.credentialIds || []).length,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

  )
}
