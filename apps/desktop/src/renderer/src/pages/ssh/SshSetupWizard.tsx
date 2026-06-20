import type { ReactElement } from 'react'
import { useSshSetupWizard, SSH_SETUP_WIZARD_STEPS } from './useSshSetupWizard'
import './SshSetupWizard.css'

const STEP_LABELS = [
  'wizard.steps.intro',
  'wizard.steps.key',
  'wizard.steps.github',
  'wizard.steps.server',
  'wizard.steps.harden',
  'wizard.steps.done',
] as const

export function SshSetupWizard({
  onOpenAdvanced,
  initialStep,
}: {
  onOpenAdvanced: () => void
  initialStep?: number
}): ReactElement {
  const vm = useSshSetupWizard(onOpenAdvanced, initialStep)

  if (!vm.hydrated) {
    return (
      <div className="ssh-wizard-page elevated-page">
        <p className="hp-muted">{vm.t('wizard.loading')}</p>
      </div>
    )
  }

  return (
    <div className="ssh-wizard-page elevated-page">
      <header className="ssh-wizard-header">
        <div>
          <div className="ssh-section-label">{vm.t('wizard.eyebrow')}</div>
          <h1 className="ssh-wizard-title">{vm.t('wizard.title')}</h1>
          <p className="ssh-wizard-subtitle">{vm.t('wizard.subtitle')}</p>
        </div>
        <button type="button" className="hp-btn" onClick={() => void vm.finishWizard().then(onOpenAdvanced)}>
          {vm.t('wizard.openAdvanced')}
        </button>
      </header>

      <div className="ssh-wizard-shell">
        <nav className="ssh-wizard-nav" aria-label={vm.t('wizard.navLabel')}>
          {STEP_LABELS.map((key, i) => {
            const n = i + 1
            const active = vm.step === n
            const done = vm.step > n
            return (
              <button
                key={key}
                type="button"
                className={`ssh-wizard-nav-item${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                onClick={() => {
                  if (done) vm.setStep(n)
                }}
                disabled={!done && !active}
              >
                <span className="ssh-wizard-nav-num">{n}</span>
                <span>{vm.t(key)}</span>
              </button>
            )
          })}
        </nav>

        <div className="ssh-wizard-panel">
          {vm.step === 1 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.intro.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.intro.lead')}</p>
              <ol className="ssh-wizard-outline">
                <li>{vm.t('wizard.intro.itemKey')}</li>
                <li>{vm.t('wizard.intro.itemGithub')}</li>
                <li>{vm.t('wizard.intro.itemServer')}</li>
                <li>{vm.t('wizard.intro.itemHarden')}</li>
              </ol>
            </section>
          ) : null}

          {vm.step === 2 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.key.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.key.lead')}</p>
              <div className="ssh-wizard-field-row">
                <input
                  type="text"
                  className="hp-input"
                  value={vm.email}
                  onChange={(e) => vm.setEmail(e.target.value)}
                  placeholder={vm.t('generate.emailPlaceholder')}
                />
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  disabled={vm.busy}
                  onClick={() => void vm.generate()}
                >
                  {vm.pubKey ? vm.t('wizard.key.regenerate') : vm.t('generate.btn')}
                </button>
              </div>
              {vm.fingerprint ? (
                <div className="ssh-wizard-info-box">
                  <span className="hp-muted">{vm.t('identity.fingerprint')}</span>{' '}
                  <span className="mono">{vm.fingerprint}</span>
                </div>
              ) : null}
              {vm.pubKey ? (
                <textarea readOnly className="ssh-wizard-pubkey" value={vm.pubKey} rows={4} />
              ) : null}
            </section>
          ) : null}

          {vm.step === 3 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.github.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.github.lead')}</p>
              <ol className="ssh-wizard-outline">
                <li>{vm.t('wizard.github.stepCopy')}</li>
                <li>{vm.t('wizard.github.stepPaste')}</li>
                <li>{vm.t('wizard.github.stepTest')}</li>
              </ol>
              <div className="ssh-wizard-actions">
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  disabled={vm.busy || !vm.pubKey}
                  onClick={() => void vm.copyPub()}
                >
                  {vm.t('identity.copyBtn')}
                </button>
                <button type="button" className="hp-btn" onClick={() => void window.dh.openExternal(vm.githubUrl)}>
                  {vm.t('identity.openGithubSshSettings')}
                </button>
                <button type="button" className="hp-btn" disabled={vm.busy} onClick={() => void vm.testGithub()}>
                  {vm.t('identity.testBtn')}
                </button>
              </div>
              {vm.testOk !== null ? (
                <div className={`ssh-wizard-result is-${vm.testOk ? 'ok' : 'err'}`}>
                  <strong>{vm.testOk ? vm.t('identity.testSuccessLabel') : vm.t('identity.testFailLabel')}</strong>
                  <div className="mono">{vm.testResult}</div>
                </div>
              ) : null}
              {!vm.testOk && vm.githubSkipped ? (
                <p className="ssh-wizard-note">{vm.t('wizard.github.skippedNote')}</p>
              ) : null}
            </section>
          ) : null}

          {vm.step === 4 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.server.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.server.lead')}</p>
              {vm.localSshEnabled ? (
                <div className="ssh-wizard-result is-ok">{vm.t('enable.alreadyEnabledDetail')}</div>
              ) : (
                <>
                  <p className="ssh-wizard-note">{vm.t('wizard.server.optional')}</p>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    disabled={vm.enableLocalBusy}
                    onClick={() => void vm.enableLocalSsh()}
                  >
                    {vm.enableLocalBusy ? vm.t('enable.inProgress') : vm.t('enable.btn')}
                  </button>
                  {vm.enableLocalLog ? <pre className="ssh-wizard-log">{vm.enableLocalLog}</pre> : null}
                </>
              )}
            </section>
          ) : null}

          {vm.step === 5 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.harden.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.harden.lead')}</p>
              <p className="ssh-wizard-note">{vm.t('wizard.harden.optional')}</p>
              <div className="ssh-wizard-actions">
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  disabled={vm.disablePasswordBusy}
                  onClick={() => void vm.runDisablePasswordAuth()}
                >
                  {vm.disablePasswordBusy ? vm.t('wizard.harden.running') : vm.t('wizard.harden.runBtn')}
                </button>
                <button type="button" className="hp-btn" onClick={() => void vm.copyDisablePasswordCmd()}>
                  {vm.passwordCmdCopied ? vm.t('wizard.harden.copied') : vm.t('wizard.harden.copyCmd')}
                </button>
              </div>
            </section>
          ) : null}

          {vm.step === 6 ? (
            <section>
              <h2 className="ssh-wizard-step-title">{vm.t('wizard.done.title')}</h2>
              <p className="ssh-wizard-step-lead">{vm.t('wizard.done.lead')}</p>
              <ul className="ssh-wizard-checklist">
                <li className={vm.pubKey ? 'is-ok' : ''}>{vm.t('wizard.done.checkKey')}</li>
                <li className={vm.testOk || vm.githubSkipped ? 'is-ok' : ''}>{vm.t('wizard.done.checkGithub')}</li>
                <li className={vm.localSshEnabled ? 'is-ok' : 'is-muted'}>{vm.t('wizard.done.checkServer')}</li>
              </ul>
            </section>
          ) : null}

          {vm.status ? <div className="ssh-wizard-status">{vm.status}</div> : null}

          <footer className="ssh-wizard-footer">
            <button type="button" className="hp-btn" disabled={vm.step <= 1} onClick={vm.back}>
              {vm.t('wizard.back')}
            </button>
            <div className="ssh-wizard-footer-right">
              {vm.step === 3 && vm.testOk !== true && !vm.githubSkipped ? (
                <button type="button" className="hp-btn" onClick={vm.skipGithub}>
                  {vm.t('wizard.github.skip')}
                </button>
              ) : null}
              {vm.step === 4 || vm.step === 5 ? (
                <button type="button" className="hp-btn" onClick={vm.next}>
                  {vm.t('wizard.skipStep')}
                </button>
              ) : null}
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                disabled={!vm.canProceed()}
                onClick={() => {
                  if (vm.step === SSH_SETUP_WIZARD_STEPS) void vm.finishWizard()
                  else vm.next()
                }}
              >
                {vm.step === SSH_SETUP_WIZARD_STEPS ? vm.t('wizard.finish') : vm.t('wizard.next')}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
