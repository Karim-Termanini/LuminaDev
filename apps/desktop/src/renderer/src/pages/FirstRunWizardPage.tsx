import type { ReactElement } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import './FirstRunWizardPage.css'

export function FirstRunWizardPage({ onComplete }: { onComplete: () => void }): ReactElement {
  const { t } = useTranslation('readiness')
  const [step, setStep] = useState(1)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const TOTAL_STEPS = 3

  const canProceed = (): boolean => {
    if (saving) return false
    return true // both steps are optional — advanced users can skip
  }

  const handleFinalize = async (skipped: boolean) => {
    setSaving(true)
    setError(null)
    try {
      await window.dh.storeSet({ key: 'appearance', data: { theme } })
      if (gitName.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.name', value: gitName.trim() })
      }
      if (gitEmail.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.email', value: gitEmail.trim() })
      }
      await window.dh.storeSet({ key: 'first_run_wizard_complete', data: true })
      if (skipped) {
        onComplete()
      } else {
        setStep(3)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleNext = () => {
    if (step === 2) {
      void handleFinalize(false)
      return
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const handleSkip = () => {
    void handleFinalize(true)
  }

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1)
  }

  const handleStart = () => {
    onComplete()
  }

  return (
    <div className="firstrun-wizard">
      <div className="firstrun-wizard-bg" />

      <div className="firstrun-wizard-container">
        {/* Progress Dots */}
        <div className="firstrun-progress-dots">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`firstrun-progress-dot ${s === step ? 'active' : ''} ${s < step ? 'complete' : ''}`}
            />
          ))}
        </div>

        {/* STEP 1: Theme */}
        {step === 1 && (
          <div className="firstrun-content">
            <div className="firstrun-icon-wrap">
              <span className="codicon codicon-color-mode" />
            </div>
            <h1 className="firstrun-title">{t('wizard.config.title')}</h1>
            <p className="firstrun-subtitle">{t('wizard.config.subtitle')}</p>

            <div className="firstrun-theme-options">
              <button
                className={`firstrun-theme-card ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <div className="firstrun-theme-preview firstrun-theme-dark" />
                <div className="firstrun-theme-label">{t('wizard.config.dark')}</div>
              </button>
              <button
                className={`firstrun-theme-card ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <div className="firstrun-theme-preview firstrun-theme-light" />
                <div className="firstrun-theme-label">{t('wizard.config.light')}</div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Git Identity */}
        {step === 2 && (
          <div className="firstrun-content">
            <div className="firstrun-icon-wrap">
              <span className="codicon codicon-git-branch" />
            </div>
            <h1 className="firstrun-title">{t('wizard.config.gitLabel')}</h1>
            <p className="firstrun-subtitle">
              {t('wizard.config.hint')}
              <br />
              <span style={{ fontSize: 13, opacity: 0.7 }}>
                Optional — you can set this up later in Git Config if you prefer.
              </span>
            </p>

            <div className="firstrun-git-form">
              <div className="firstrun-field">
                <label className="firstrun-field-label">{t('wizard.config.namePlaceholder')}</label>
                <input
                  type="text"
                  className="firstrun-input"
                  placeholder="Jane Doe"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
              </div>
              <div className="firstrun-field">
                <label className="firstrun-field-label">
                  {t('wizard.config.emailPlaceholder')}
                </label>
                <input
                  type="email"
                  className="firstrun-input"
                  placeholder="jane@example.com"
                  value={gitEmail}
                  onChange={(e) => setGitEmail(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {error && (
              <div className="firstrun-error">
                <span className="codicon codicon-error" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Complete */}
        {step === 3 && (
          <div className="firstrun-content firstrun-complete">
            <div className="firstrun-icon-wrap firstrun-icon-success">
              <span className="codicon codicon-check-all" />
            </div>
            <h1 className="firstrun-title">{t('wizard.install.completeTitle')}</h1>
            <p className="firstrun-subtitle">
              {t('wizard.config.dark')} theme applied. Git identity configured. You're all set.
            </p>

            <button className="firstrun-start-btn" onClick={handleStart}>
              {t('wizard.footer.start')}
              <span className="codicon codicon-chevron-right" />
            </button>
          </div>
        )}

        {/* Footer */}
        {step < 3 && (
          <div className="firstrun-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                className="firstrun-btn-nav firstrun-btn-back"
                onClick={handleBack}
                disabled={step === 1}
              >
                <span className="codicon codicon-chevron-left" />
                {t('wizard.footer.back')}
              </button>
              <button
                className="firstrun-btn-skip"
                onClick={handleSkip}
                disabled={saving}
                title="Skip setup — you can configure everything later in Settings and Git Config"
              >
                Skip for now
              </button>
            </div>

            <button
              className="firstrun-btn-nav firstrun-btn-next"
              onClick={() => handleNext()}
              disabled={!canProceed() || saving}
            >
              {saving ? (
                <>
                  <span className="codicon codicon-loading codicon-modifier-spin" />
                  Saving…
                </>
              ) : step === 2 ? (
                <>
                  Finish
                  <span className="codicon codicon-chevron-right" />
                </>
              ) : (
                <>
                  {t('wizard.footer.next')}
                  <span className="codicon codicon-chevron-right" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
