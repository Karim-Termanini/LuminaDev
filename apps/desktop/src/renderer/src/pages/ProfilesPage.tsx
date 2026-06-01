import type { ReactElement } from 'react'
import './ProfilesPage.css'
import { ProfileWizardModal } from './profiles/ProfileWizardModal'
import { ProfilesAutomationTab } from './profiles/ProfilesAutomationTab'
import { ProfilesBackupTab } from './profiles/ProfilesBackupTab'
import { ProfilesBuilderTab } from './profiles/ProfilesBuilderTab'
import { useProfilesPage } from './profiles/useProfilesPage'

export function ProfilesPage(): ReactElement {
  const vm = useProfilesPage()

  return (
    <div
      className="profiles-page elevated-page"
      style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 40px' }}
    >
      <header style={{ paddingBottom: 24, paddingTop: 16 }}>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          {vm.t('page.sectionLabel')}
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>{vm.t('page.title')}</h1>
        <p
          style={{
            color: 'var(--text-muted)',
            marginTop: 10,
            maxWidth: 760,
            lineHeight: 1.5,
            fontSize: 15,
          }}
        >
          {vm.t('page.subtitle')}
        </p>
      </header>

      {vm.status && (
        <div className={`hp-status-alert ${vm.status.type}`} style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 16 }}>{vm.status.type === 'success' ? '✔' : '⚠'}</span>
          <span>{vm.status.message}</span>
        </div>
      )}

      <div className="tabs-container">
        {(['builder', 'automation', 'backup'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${vm.activeTab === tab ? 'active' : ''}`}
            onClick={() => vm.setActiveTab(tab)}
          >
            {tab === 'builder' && vm.t('tab.builder')}
            {tab === 'automation' && vm.t('tab.automation')}
            {tab === 'backup' && vm.t('tab.backup')}
          </button>
        ))}
      </div>

      {vm.activeTab === 'automation' && <ProfilesAutomationTab vm={vm} />}
      {vm.activeTab === 'builder' && <ProfilesBuilderTab vm={vm} />}
      {vm.activeTab === 'backup' && <ProfilesBackupTab vm={vm} />}

      <ProfileWizardModal vm={vm} />
    </div>
  )
}
