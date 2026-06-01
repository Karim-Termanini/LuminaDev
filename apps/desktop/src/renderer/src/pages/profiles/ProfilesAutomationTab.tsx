import type { ReactElement } from 'react'
import type { ProfilesPageViewModel } from './useProfilesPage'

export function ProfilesAutomationTab({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  return (
        <section style={{ padding: '16px 0' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 20 }}>
            {t('automation.title')}
          </div>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 14,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              maxWidth: 800,
            }}
          >
            {t('automation.subtitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="profiles-list-row" style={{ cursor: 'pointer' }}>
              <div className="row-left">
                <div className="row-icon-box" style={{ background: 'transparent' }}>
                  <span
                    className="codicon codicon-play"
                    style={{ fontSize: 24, color: 'var(--text)' }}
                  />
                </div>
                <div className="row-title-area">
                  <span className="row-title">{t('automation.composeUp.title')}</span>
                  <span className="row-subtitle">{t('automation.composeUp.desc')}</span>
                </div>
              </div>
              <div className="row-actions">
                <div className="fluent-toggle">
                  <input
                    type="checkbox"
                    checked={vm.onLogin.composeUpForActiveProfile}
                    onChange={(e) =>
                      void vm.saveOnLogin({ ...vm.onLogin, composeUpForActiveProfile: e.target.checked })
                    }
                  />
                  <span className="fluent-slider"></span>
                </div>
              </div>
            </label>
          </div>
        </section>
  )
}
