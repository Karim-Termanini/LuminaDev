import type { ReactElement } from 'react'
import { ProfileWizardStep1 } from './wizard/ProfileWizardStep1'
import { ProfileWizardStep2 } from './wizard/ProfileWizardStep2'
import { ProfileWizardStep3 } from './wizard/ProfileWizardStep3'
import { ProfileWizardStep4 } from './wizard/ProfileWizardStep4'
import { ProfileWizardStep5 } from './wizard/ProfileWizardStep5'
import { btn } from './profilesStyles'
import type { ProfilesPageViewModel } from './useProfilesPage'

export function ProfileWizardModal({ vm }: { vm: ProfilesPageViewModel }): ReactElement | null {
  if (!vm.wizardData) return null
  const wizardData = vm.wizardData
  const { t } = vm
  return (
      <div className="fluent-modal-overlay">
          <div
            className="fluent-modal-content wizard-container"
            style={{
              display: 'flex',
              flexDirection: 'row',
              width: '850px',
              maxWidth: '95vw',
              height: '600px',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            {/* LEFT SIDEBAR: Steps Indicator */}
            <div
              style={{
                width: '220px',
                background: 'rgba(0,0,0,0.15)',
                borderRight: '1px solid var(--border)',
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {vm.isCreatingProfile ? t('wizard.sidebar.create') : t('wizard.sidebar.edit')}
              </div>
              {[
                { step: 1, label: t('wizard.step1') },
                { step: 2, label: t('wizard.step2') },
                { step: 3, label: t('wizard.step3') },
                { step: 4, label: t('wizard.step4') },
                { step: 5, label: t('wizard.step5') },
              ].map((s) => {
                const isActive = vm.wizardStep === s.step
                const isCompleted = vm.wizardStep > s.step
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      if (wizardData.name.trim() || s.step === 1) {
                        vm.setWizardStep(s.step)
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 6,
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: 'none',
                      color: isActive
                        ? 'var(--text)'
                        : isCompleted
                          ? 'var(--green)'
                          : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.2s ease',
                      width: '100%',
                    }}
                  >
                    <span
                      className="codicon codicon-check"
                      style={{ marginRight: 8, opacity: isCompleted ? 1 : 0, fontSize: 14 }}
                    />
                    <span style={{ flex: 1 }}>{s.label}</span>
                  </button>
                )
              })}
            </div>

            {/* RIGHT MAIN PANEL: Step Content */}
            <div
              style={{
                flex: 1,
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minWidth: 0,
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {vm.wizardStep === 1 && <ProfileWizardStep1 vm={vm} />}
                {vm.wizardStep === 2 && <ProfileWizardStep2 vm={vm} />}
                {vm.wizardStep === 3 && <ProfileWizardStep3 vm={vm} />}
                {vm.wizardStep === 4 && <ProfileWizardStep4 vm={vm} />}
                {vm.wizardStep === 5 && <ProfileWizardStep5 vm={vm} />}
              </div>
              {/* FOOTER ACTIONS */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 20,
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  style={{ ...btn, padding: '10px 20px' }}
                  onClick={() => {
                    vm.setWizardData(null)
                    vm.setIsCreatingProfile(false)
                    vm.setEditingProfileIdx(null)
                    vm.setOtherRuntimePorts([])
                  }}
                >
                  {t('btn.cancel')}
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                  {vm.wizardStep > 1 && (
                    <button
                      type="button"
                      style={{ ...btn, padding: '10px 20px' }}
                      onClick={() => vm.setWizardStep(vm.wizardStep - 1)}
                    >
                      {t('btn.back')}
                    </button>
                  )}
                  {vm.wizardStep < 5 ? (
                    <button
                      type="button"
                      className="dev-home-btn"
                      style={{ padding: '10px 24px', margin: 0 }}
                      disabled={vm.wizardNextBlocked}
                      onClick={() => vm.setWizardStep(vm.wizardStep + 1)}
                    >
                      {t('btn.next')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dev-home-btn"
                      style={{ padding: '10px 24px', margin: 0 }}
                      onClick={() => void vm.saveWizardChanges()}
                    >
                      {vm.isCreatingProfile ? t('wizard.footer.deploy') : t('wizard.footer.apply')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
  )
}
