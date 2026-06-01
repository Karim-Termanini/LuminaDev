import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import { btn, btnSmallDanger } from '../profilesStyles'
import type { ProfilesPageViewModel } from '../useProfilesPage'

export function ProfileWizardStep4({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  if (!vm.wizardData) return <></>
  const wizardData = vm.wizardData
  const setWizardData = vm.setWizardData
  return (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                        {t('wizard.cred.title')}
                      </h3>
                      {/* Mode Toggle tabs */}
                      <div
                        style={{
                          display: 'flex',
                          background: 'rgba(255,255,255,0.06)',
                          padding: 3,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => vm.setCredMode('beginner')}
                          style={{
                            background:
                              vm.credMode === 'beginner' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: vm.credMode === 'beginner' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {t('mode.beginner')}
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.setCredMode('expert')}
                          style={{
                            background:
                              vm.credMode === 'expert' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: vm.credMode === 'expert' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {t('mode.expert')}
                        </button>
                      </div>
                    </div>

                    {vm.credMode === 'beginner' ? (
                      <div>
                        {/* Friendly Beginner Explanation */}
                        <div
                          style={{
                            background: 'rgba(124, 77, 255, 0.05)',
                            border: '1px solid rgba(124, 77, 255, 0.15)',
                            borderRadius: 8,
                            padding: 16,
                            marginBottom: 20,
                            fontSize: 13,
                            lineHeight: 1.5,
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
                            <span
                              className="codicon codicon-shield"
                              style={{ color: 'var(--accent)' }}
                            />
                            <span>{t('wizard.cred.beginner.title')}</span>
                          </div>
                          {t('wizard.cred.beginner.desc')}
                        </div>

                        {/* Quick Presets Recommendation Buttons */}
                        <div style={{ marginBottom: 20 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: 10,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {t('wizard.cred.beginner.templates')}
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {[
                              { id: 'GITHUB_TOKEN', desc: t('credPreset.github') },
                              { id: 'NPM_TOKEN', desc: t('credPreset.npm') },
                              { id: 'AWS_ACCESS_KEY_ID', desc: t('credPreset.aws') },
                            ].map((preset) => {
                              const alreadyLinked = (wizardData.credentialIds || []).includes(
                                preset.id
                              )
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  className="dev-home-btn"
                                  style={{
                                    fontSize: 11,
                                    padding: '8px 12px',
                                    margin: 0,
                                    borderColor: alreadyLinked ? 'var(--green)' : 'var(--border)',
                                    background: alreadyLinked
                                      ? 'rgba(76, 175, 80, 0.08)'
                                      : 'transparent',
                                    color: alreadyLinked ? 'var(--green)' : 'var(--text)',
                                  }}
                                  onClick={() => {
                                    vm.setCredInputId(preset.id)
                                  }}
                                >
                                  {alreadyLinked ? '✓ Linked: ' : '+ Configure: '} {preset.desc} (
                                  {preset.id})
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Add Credential Value Form if Preset Selected */}
                        {vm.credInputId && (
                          <div
                            style={{
                              background: 'rgba(0, 0, 0, 0.15)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: 14,
                              marginBottom: 16,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 8,
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>
                                <Trans
                                  i18nKey="wizard.cred.beginner.enterSecret"
                                  t={t}
                                  values={{ id: vm.credInputId }}
                                />
                              </span>
                              <button
                                type="button"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                }}
                                onClick={() => vm.setCredInputId('')}
                              >
                                {t('btn.cancel')}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <input
                                type="password"
                                value={vm.credInputValue}
                                onChange={(e) => vm.setCredInputValue(e.target.value)}
                                placeholder={t('wizard.cred.beginner.secretPlaceholder')}
                                className="fluent-input"
                                style={{ flex: 1 }}
                              />
                              <button
                                type="button"
                                style={{ ...btn, padding: '0 20px' }}
                                onClick={async () => {
                                  if (!vm.credInputValue.trim()) return
                                  try {
                                    const res = await window.dh.profileCredentialsStore({
                                      id: vm.credInputId,
                                      value: vm.credInputValue.trim(),
                                    })
                                    if (!res.ok) {
                                      vm.setStatus({
                                        message: res.error || t('msg.credSaveFailed'),
                                        type: 'warning',
                                      })
                                      return
                                    }
                                    const credIds = [
                                      ...(wizardData.credentialIds || []),
                                      vm.credInputId,
                                    ]
                                    setWizardData({ ...wizardData, credentialIds: credIds })
                                    vm.setCredInputId('')
                                    vm.setCredInputValue('')
                                  } catch (e) {
                                    vm.setStatus({
                                      message:
                                        e instanceof Error ? e.message : t('msg.credSaveFailed'),
                                      type: 'warning',
                                    })
                                  }
                                }}
                              >
                                {t('wizard.cred.beginner.saveLink')}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Currently Linked Credentials list */}
                        {(wizardData.credentialIds || []).length > 0 && (
                          <div
                            style={{
                              background: 'rgba(0,0,0,0.15)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: 12,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                              {t('wizard.cred.beginner.currentSecrets')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(wizardData.credentialIds || []).map((credId, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: 12,
                                    fontFamily: 'monospace',
                                    background: 'rgba(0,0,0,0.1)',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                  }}
                                >
                                  <span>🔒 {credId}</span>
                                  <button
                                    type="button"
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--red)',
                                      cursor: 'pointer',
                                      fontSize: 12,
                                    }}
                                    onClick={() => {
                                      const oldIds = wizardData.credentialIds || []
                                      const credIds = oldIds.filter((_, idx) => idx !== i)
                                      setWizardData({ ...wizardData, credentialIds: credIds })
                                    }}
                                  >
                                    {t('btn.delete')}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {/* Expert Mode */}
                        <div
                          style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 16,
                            fontSize: 12,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('wizard.cred.expert.title')}
                        </div>

                        {/* Existing Credentials to link */}
                        {vm.existingCredentialIds.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <label
                              style={{
                                display: 'block',
                                fontSize: 12,
                                fontWeight: 600,
                                marginBottom: 6,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('wizard.cred.expert.existingCredentials')}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {vm.existingCredentialIds.map((id) => {
                                const alreadyLinked = (wizardData.credentialIds || []).includes(id)
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    className="dev-home-btn"
                                    style={{
                                      fontSize: 11,
                                      padding: '4px 8px',
                                      margin: 0,
                                      borderColor: alreadyLinked ? 'var(--green)' : 'var(--border)',
                                      color: alreadyLinked ? 'var(--green)' : 'var(--text)',
                                    }}
                                    onClick={() => {
                                      if (alreadyLinked) {
                                        const credIds = (wizardData.credentialIds || []).filter(
                                          (c) => c !== id
                                        )
                                        setWizardData({ ...wizardData, credentialIds: credIds })
                                      } else {
                                        const credIds = [...(wizardData.credentialIds || []), id]
                                        setWizardData({ ...wizardData, credentialIds: credIds })
                                      }
                                    }}
                                  >
                                    {alreadyLinked ? '✓ ' : '+ '} {id}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Standard builder/list */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            maxHeight: '150px',
                            overflowY: 'auto',
                            marginBottom: 16,
                            paddingRight: 4,
                          }}
                        >
                          {(wizardData.credentialIds || []).map((credId, ci) => (
                            <div
                              key={ci}
                              style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                            >
                              <span
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  background: 'rgba(0,0,0,0.15)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {credId}
                              </span>
                              <button
                                type="button"
                                style={{ ...btnSmallDanger, padding: '8px 16px' }}
                                onClick={() => {
                                  const oldIds = wizardData.credentialIds || []
                                  const credIds = oldIds.filter((_, i) => i !== ci)
                                  setWizardData({ ...wizardData, credentialIds: credIds })
                                }}
                              >
                                {t('btn.delete')}
                              </button>
                            </div>
                          ))}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            borderTop: '1px solid var(--border)',
                            paddingTop: 12,
                          }}
                        >
                          <input
                            type="text"
                            value={vm.credInputId}
                            onChange={(e) => vm.setCredInputId(e.target.value)}
                            placeholder={t('wizard.cred.expert.idPlaceholder')}
                            className="fluent-input"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="password"
                            value={vm.credInputValue}
                            onChange={(e) => vm.setCredInputValue(e.target.value)}
                            placeholder={t('wizard.cred.expert.secretPlaceholder')}
                            className="fluent-input"
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            style={{ ...btn, padding: '0 20px' }}
                            onClick={async () => {
                              if (!vm.credInputId.trim() || !vm.credInputValue.trim()) return
                              const cId = vm.credInputId.trim()
                              try {
                                const res = await window.dh.profileCredentialsStore({
                                  id: cId,
                                  value: vm.credInputValue.trim(),
                                })
                                if (!res.ok) {
                                  vm.setStatus({
                                    message: res.error || t('msg.credSaveFailed'),
                                    type: 'warning',
                                  })
                                  return
                                }
                                const credIds = [...(wizardData.credentialIds || []), cId]
                                setWizardData({ ...wizardData, credentialIds: credIds })
                                vm.setCredInputId('')
                                vm.setCredInputValue('')
                              } catch (e) {
                                vm.setStatus({
                                  message: e instanceof Error ? e.message : t('msg.credSaveFailed'),
                                  type: 'warning',
                                })
                              }
                            }}
                          >
                            {t('btn.add')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

  )
}
