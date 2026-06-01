import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import {
  beginnerBundleLabelKey,
  beginnerOptionalEnvPresets,
  findEnvConflicts,
  generateUniqueEnvVars,
  isBeginnerBundleApplied,
  mergeEnvPresetBundle,
  syncDatabaseUrlWithPostgres,
} from '../../profileEnvConflicts'
import { btn, btnSmallDanger } from '../profilesStyles'
import type { ProfilesPageViewModel } from '../useProfilesPage'

export function ProfileWizardStep3({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
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
                        {t('wizard.env.title')}
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
                          onClick={() => vm.setEnvMode('beginner')}
                          style={{
                            background:
                              vm.envMode === 'beginner' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: vm.envMode === 'beginner' ? 'var(--text)' : 'var(--text-muted)',
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
                          onClick={() => vm.setEnvMode('expert')}
                          style={{
                            background:
                              vm.envMode === 'expert' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: vm.envMode === 'expert' ? 'var(--text)' : 'var(--text-muted)',
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

                    {vm.envConflicts.length > 0 && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'rgba(255,180,0,0.08)',
                          border: '1px solid rgba(255,180,0,0.25)',
                        }}
                      >
                        <p
                          style={{
                            margin: '0 0 8px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--yellow)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span className="codicon codicon-warning" />
                          {t('wizard.env.conflict.title')}
                        </p>
                        <ul
                          style={{
                            margin: '0 0 10px',
                            paddingLeft: 18,
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            lineHeight: 1.5,
                          }}
                        >
                          {vm.envConflicts.map((c, ci) => (
                            <li key={`${c.key}-${c.value}-${c.otherProfileName}-${ci}`}>
                              {c.reason === 'internal'
                                ? t('wizard.env.conflict.internal', {
                                    port: c.value,
                                    key: c.key,
                                  })
                                : c.reason === 'duplicate'
                                  ? t('wizard.env.conflict.duplicate', {
                                      key: c.key,
                                      value: c.value,
                                      profile: c.otherProfileName,
                                    })
                                  : t('wizard.env.conflict.port', {
                                      port: c.value,
                                      profile: c.otherProfileName,
                                      key: c.key,
                                    })}
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="dev-home-btn"
                          style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                          onClick={() =>
                            setWizardData({
                              ...wizardData,
                              envVars: generateUniqueEnvVars(
                                wizardData.baseTemplate,
                                wizardData.name,
                                vm.profiles,
                                vm.editingProfileIdx,
                                wizardData.envVars ?? [],
                                vm.otherRuntimePorts
                              ),
                            })
                          }
                        >
                          {t('wizard.env.generateUnique')}
                        </button>
                      </div>
                    )}

                    {vm.envMode === 'beginner' ? (
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
                              className="codicon codicon-star-full"
                              style={{ color: 'var(--accent)' }}
                            />
                            <span>{t('wizard.env.beginner.title')}</span>
                          </div>
                          {t('wizard.env.beginner.desc')}
                        </div>

                        {vm.beginnerRecommendedPresets.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <button
                              type="button"
                              className="dev-home-btn"
                              style={{
                                fontSize: 13,
                                padding: '10px 16px',
                                margin: 0,
                                width: '100%',
                                maxWidth: 420,
                                borderColor: isBeginnerBundleApplied(
                                  wizardData.envVars ?? [],
                                  vm.beginnerRecommendedPresets
                                )
                                  ? 'var(--green)'
                                  : 'var(--accent)',
                                background: isBeginnerBundleApplied(
                                  wizardData.envVars ?? [],
                                  vm.beginnerRecommendedPresets
                                )
                                  ? 'rgba(76, 175, 80, 0.08)'
                                  : 'rgba(124, 77, 255, 0.08)',
                              }}
                              onClick={() => {
                                const applied = isBeginnerBundleApplied(
                                  wizardData.envVars ?? [],
                                  vm.beginnerRecommendedPresets
                                )
                                let merged = mergeEnvPresetBundle(
                                  wizardData.envVars ?? [],
                                  vm.beginnerRecommendedPresets,
                                  !applied
                                )
                                if (!applied) {
                                  const conflictsAfter = findEnvConflicts(
                                    vm.profiles,
                                    merged,
                                    vm.editingProfileIdx,
                                    vm.otherRuntimePorts
                                  )
                                  if (conflictsAfter.length > 0) {
                                    merged = generateUniqueEnvVars(
                                      wizardData.baseTemplate,
                                      wizardData.name,
                                      vm.profiles,
                                      vm.editingProfileIdx,
                                      merged,
                                      vm.otherRuntimePorts
                                    )
                                  }
                                }
                                setWizardData({
                                  ...wizardData,
                                  envVars: syncDatabaseUrlWithPostgres(
                                    merged,
                                    wizardData.baseTemplate
                                  ),
                                })
                              }}
                            >
                              {isBeginnerBundleApplied(
                                wizardData.envVars ?? [],
                                vm.beginnerRecommendedPresets
                              )
                                ? '✓ '
                                : '+ '}
                              {t(beginnerBundleLabelKey(wizardData.baseTemplate))}
                            </button>
                          </div>
                        )}

                        <div style={{ marginBottom: 20 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              marginBottom: 8,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {t('wizard.env.beginner.optionalTitle')}
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {beginnerOptionalEnvPresets().map((preset) => {
                              const alreadyAdded = (wizardData.envVars || []).some(
                                (v) => v.key === preset.key
                              )
                              return (
                                <button
                                  key={preset.key}
                                  type="button"
                                  className="dev-home-btn"
                                  style={{
                                    fontSize: 11,
                                    padding: '6px 12px',
                                    margin: 0,
                                    borderColor: alreadyAdded ? 'var(--green)' : 'var(--border)',
                                    background: alreadyAdded
                                      ? 'rgba(76, 175, 80, 0.08)'
                                      : 'transparent',
                                  }}
                                  onClick={() => {
                                    if (alreadyAdded) {
                                      setWizardData({
                                        ...wizardData,
                                        envVars: (wizardData.envVars || []).filter(
                                          (v) => v.key !== preset.key
                                        ),
                                      })
                                    } else {
                                      setWizardData({
                                        ...wizardData,
                                        envVars: [
                                          ...(wizardData.envVars || []),
                                          { key: preset.key, value: preset.value },
                                        ],
                                      })
                                    }
                                  }}
                                >
                                  {alreadyAdded ? '✓ ' : '+ '}
                                  {t(preset.labelKey)}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {(wizardData.envVars || []).length > 0 && (
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {t('wizard.env.beginner.summary', {
                              count: (wizardData.envVars || []).length,
                            })}
                          </p>
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
                          <Trans i18nKey="wizard.env.expert.title" t={t} />
                        </div>

                        {/* Bulk paste input */}
                        <div style={{ marginBottom: 16 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: 6,
                            }}
                          >
                            {t('wizard.env.expert.bulkImport')}
                          </label>
                          <textarea
                            value={vm.envBulkInput}
                            onChange={(e) => vm.setEnvBulkInput(e.target.value)}
                            placeholder={t('wizard.env.expert.bulkPlaceholder')}
                            className="fluent-input"
                            style={{
                              width: '100%',
                              height: '60px',
                              fontSize: 12,
                              fontFamily: 'monospace',
                              resize: 'vertical',
                            }}
                          />
                          <button
                            type="button"
                            className="dev-home-btn"
                            style={{ marginTop: 6, fontSize: 11, padding: '4px 10px', margin: 0 }}
                            onClick={() => {
                              if (!vm.envBulkInput.trim()) return
                              const parsed: Array<{ key: string; value: string }> = []
                              vm.envBulkInput.split('\n').forEach((line) => {
                                const trimmed = line.trim()
                                if (!trimmed || trimmed.startsWith('#')) return
                                const eqIdx = trimmed.indexOf('=')
                                if (eqIdx > 0) {
                                  const key = trimmed.slice(0, eqIdx).trim()
                                  const value = trimmed
                                    .slice(eqIdx + 1)
                                    .trim()
                                    .replace(/^['"]|['"]$/g, '')
                                  if (key) parsed.push({ key, value })
                                }
                              })
                              if (parsed.length > 0) {
                                const current = wizardData.envVars || []
                                const merged = [...current]
                                parsed.forEach((item) => {
                                  const existingIdx = merged.findIndex((x) => x.key === item.key)
                                  if (existingIdx >= 0) {
                                    merged[existingIdx] = item
                                  } else {
                                    merged.push(item)
                                  }
                                })
                                setWizardData({ ...wizardData, envVars: merged })
                                vm.setEnvBulkInput('')
                              }
                            }}
                          >
                            {t('wizard.env.expert.parseBtn')}
                          </button>
                        </div>

                        {/* Standard Builder List */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            maxHeight: '180px',
                            overflowY: 'auto',
                            marginBottom: 16,
                            paddingRight: 4,
                          }}
                        >
                          {(wizardData.envVars || []).map((ev, vi) => (
                            <div
                              key={vi}
                              style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                            >
                              <input
                                type="text"
                                value={ev.key}
                                onChange={(e) => {
                                  const vars = [...(wizardData.envVars || [])]
                                  vars[vi] = { ...vars[vi], key: e.target.value }
                                  setWizardData({ ...wizardData, envVars: vars })
                                }}
                                placeholder={t('wizard.env.expert.keyPlaceholder')}
                                className="fluent-input"
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                              />
                              <input
                                type="text"
                                value={ev.value}
                                onChange={(e) => {
                                  const vars = [...(wizardData.envVars || [])]
                                  vars[vi] = { ...vars[vi], value: e.target.value }
                                  setWizardData({ ...wizardData, envVars: vars })
                                }}
                                placeholder={t('wizard.env.expert.valuePlaceholder')}
                                className="fluent-input"
                                style={{ flex: 2, fontFamily: 'monospace', fontSize: 13 }}
                              />
                              <button
                                type="button"
                                style={{ ...btnSmallDanger, padding: '8px 12px' }}
                                onClick={() => {
                                  const vars = (wizardData.envVars || []).filter((_, i) => i !== vi)
                                  setWizardData({ ...wizardData, envVars: vars })
                                }}
                              >
                                ✕
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
                            value={vm.envKeyInput}
                            onChange={(e) => vm.setEnvKeyInput(e.target.value)}
                            placeholder={t('wizard.env.expert.newKeyPlaceholder')}
                            className="fluent-input"
                            style={{ flex: 1, fontFamily: 'monospace' }}
                          />
                          <input
                            type="text"
                            value={vm.envValueInput}
                            onChange={(e) => vm.setEnvValueInput(e.target.value)}
                            placeholder={t('wizard.env.expert.newValuePlaceholder')}
                            className="fluent-input"
                            style={{ flex: 2, fontFamily: 'monospace' }}
                          />
                          <button
                            type="button"
                            style={{ ...btn, padding: '0 20px' }}
                            onClick={() => {
                              if (!vm.envKeyInput.trim() || !vm.envValueInput.trim()) return
                              const vars = [
                                ...(wizardData.envVars || []),
                                { key: vm.envKeyInput.trim(), value: vm.envValueInput.trim() },
                              ]
                              setWizardData({ ...wizardData, envVars: vars })
                              vm.setEnvKeyInput('')
                              vm.setEnvValueInput('')
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
