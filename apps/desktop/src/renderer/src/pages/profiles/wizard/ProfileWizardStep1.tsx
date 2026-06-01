import type { ReactElement } from 'react'
import type { ComposeProfile } from '@linux-dev-home/shared'
import { suggestUniqueProfileName } from '../../profileEnvConflicts'
import { BASE_TEMPLATES } from '../constants'
import { btn } from '../profilesStyles'
import type { ProfilesPageViewModel } from '../useProfilesPage'

export function ProfileWizardStep1({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  if (!vm.wizardData) return <></>
  const wizardData = vm.wizardData
  const setWizardData = vm.setWizardData
  return (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
                      {t('wizard.general.title')}
                    </h3>
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 13,
                        marginBottom: 24,
                        lineHeight: 1.4,
                      }}
                    >
                      {t('wizard.general.subtitle')}
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      <label
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                      >
                        {t('wizard.general.nameLabel')}
                      </label>
                      <input
                        type="text"
                        value={wizardData.name}
                        onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                        placeholder={t('wizard.general.namePlaceholder')}
                        className="fluent-input"
                        style={{ width: '100%' }}
                        autoFocus
                      />
                      {vm.duplicateProfileName && (
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
                            {t('wizard.general.nameDuplicateWarning', { name: vm.duplicateProfileName })}
                          </p>
                          <button
                            type="button"
                            className="dev-home-btn"
                            style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                            onClick={() =>
                              setWizardData({
                                ...wizardData,
                                name: suggestUniqueProfileName(
                                  wizardData.name,
                                  vm.profiles,
                                  vm.editingProfileIdx
                                ),
                              })
                            }
                          >
                            {t('wizard.general.suggestUniqueName')}
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                      >
                        {t('wizard.general.templateLabel')}
                      </label>
                      <select
                        value={wizardData.baseTemplate}
                        onChange={(e) =>
                          setWizardData({
                            ...wizardData,
                            baseTemplate: e.target.value as ComposeProfile,
                          })
                        }
                        className="fluent-input"
                        style={{ appearance: 'none', width: '100%' }}
                        disabled={!vm.isCreatingProfile}
                      >
                        {BASE_TEMPLATES.map((template) => (
                          <option
                            key={template}
                            value={template}
                            style={{ background: '#18181c', color: 'var(--text)' }}
                          >
                            {template}
                          </option>
                        ))}
                      </select>
                      {!vm.isCreatingProfile && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('wizard.general.templateLocked')}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: 20 }}>
                      <label
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                      >
                        {t('wizard.general.descLabel')}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
                          {t('wizard.general.descOptional')}
                        </span>
                      </label>
                      <textarea
                        value={wizardData.description ?? ''}
                        onChange={(e) =>
                          setWizardData({ ...wizardData, description: e.target.value || undefined })
                        }
                        placeholder={t('wizard.general.descPlaceholder')}
                        className="fluent-input"
                        style={{
                          width: '100%',
                          minHeight: 72,
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {/* Tags */}
                    <div style={{ marginBottom: 20 }}>
                      <label
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                      >
                        {t('wizard.general.tagsLabel')}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
                          {t('wizard.general.tagsOptional')}
                        </span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {(wizardData.tags ?? []).map((tag, ti) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(124,77,255,0.12)',
                              border: '1px solid rgba(124,77,255,0.3)',
                              color: 'var(--text)',
                              borderRadius: 20,
                              padding: '2px 10px',
                              fontSize: 12,
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() =>
                                setWizardData({
                                  ...wizardData,
                                  tags: (wizardData.tags ?? []).filter((_, i) => i !== ti),
                                })
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: 12,
                                lineHeight: 1,
                              }}
                              aria-label={t('btn.removeTag')}
                              title={t('btn.removeTag')}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={vm.tagInput}
                          onChange={(e) => vm.setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && vm.tagInput.trim()) {
                              e.preventDefault()
                              const current = wizardData.tags ?? []
                              if (current.length < 10 && !current.includes(vm.tagInput.trim())) {
                                setWizardData({
                                  ...wizardData,
                                  tags: [...current, vm.tagInput.trim()],
                                })
                              }
                              vm.setTagInput('')
                            }
                          }}
                          placeholder={t('wizard.general.tagsPlaceholder')}
                          className="fluent-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          style={{ ...btn, padding: '0 16px' }}
                          onClick={() => {
                            if (!vm.tagInput.trim()) return
                            const current = wizardData.tags ?? []
                            if (current.length < 10 && !current.includes(vm.tagInput.trim())) {
                              setWizardData({ ...wizardData, tags: [...current, vm.tagInput.trim()] })
                            }
                            vm.setTagInput('')
                          }}
                        >
                          {t('btn.add')}
                        </button>
                      </div>
                    </div>

                    {/* Compose Variant */}
                    <div style={{ marginBottom: 20 }}>
                      <label
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
                      >
                        {t('wizard.general.composeLabel')}
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['stub', 'full'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setWizardData({ ...wizardData, composeVariant: v })}
                            style={{
                              padding: '8px 20px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              border: '1px solid',
                              borderColor:
                                (wizardData.composeVariant ?? 'stub') === v
                                  ? 'var(--accent)'
                                  : 'rgba(255,255,255,0.1)',
                              background:
                                (wizardData.composeVariant ?? 'stub') === v
                                  ? 'rgba(124,77,255,0.15)'
                                  : 'rgba(255,255,255,0.04)',
                              color:
                                (wizardData.composeVariant ?? 'stub') === v
                                  ? 'var(--accent)'
                                  : 'var(--text-muted)',
                            }}
                          >
                            {v === 'stub'
                              ? t('wizard.general.composeStub')
                              : t('wizard.general.composeFull')}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('wizard.general.composeHint')}
                      </p>
                    </div>
                  </div>

  )
}
