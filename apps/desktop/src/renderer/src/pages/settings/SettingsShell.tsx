import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../SettingsPage.css'
import { SettingsPersonalization } from './SettingsPersonalization'
import { SettingsRemote } from './SettingsRemote'
import { SettingsSystem } from './SettingsSystem'
import { SettingsAccounts } from './SettingsAccounts'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsUpdate } from './SettingsUpdate'
import { SettingsAppEngine } from './SettingsAppEngine'
import { SettingsBuilder } from './SettingsBuilder'
import { SettingsBetaFeatures } from './SettingsBetaFeatures'
import { SettingsNotification } from './SettingsNotification'
import { SettingsShortcuts } from './SettingsShortcuts'
import { SettingsHelpAbout } from './SettingsHelpAbout'
import { SettingsDateTime } from './SettingsDateTime'
import { SettingsLanguages } from './SettingsLanguages'

type SettingsNavId =
  | 'personalization' | 'remote' | 'system' | 'accounts' | 'general' | 'update'
  | 'app-engine' | 'builder' | 'beta'
  | 'notification' | 'shortcuts' | 'help-about' | 'datetime' | 'languages'

type NavItem = { id: SettingsNavId; labelKey: string; hintKey: string; icon: string; beta?: boolean }

const NAV: ReadonlyArray<NavItem> = [
  { id: 'personalization', labelKey: 'shell.navPersonalization', hintKey: 'shell.navPersonalizationHint', icon: 'color-mode' },
  { id: 'languages', labelKey: 'shell.navLanguages', hintKey: 'shell.navLanguagesHint', icon: 'globe' },
  { id: 'datetime', labelKey: 'shell.navDatetime', hintKey: 'shell.navDatetimeHint', icon: 'clock' },
  { id: 'remote', labelKey: 'shell.navRemote', hintKey: 'shell.navRemoteHint', icon: 'terminal-linux' },
  { id: 'accounts', labelKey: 'shell.navAccounts', hintKey: 'shell.navAccountsHint', icon: 'github' },
  { id: 'system', labelKey: 'shell.navSystem', hintKey: 'shell.navSystemHint', icon: 'inspect' },
  { id: 'general', labelKey: 'shell.navGeneral', hintKey: 'shell.navGeneralHint', icon: 'settings' },
  { id: 'update', labelKey: 'shell.navUpdate', hintKey: 'shell.navUpdateHint', icon: 'arrow-circle-up' },
  { id: 'notification', labelKey: 'shell.navNotification', hintKey: 'shell.navNotificationHint', icon: 'bell' },
  { id: 'shortcuts', labelKey: 'shell.navShortcuts', hintKey: 'shell.navShortcutsHint', icon: 'keyboard' },
  { id: 'help-about', labelKey: 'shell.navHelpAbout', hintKey: 'shell.navHelpAboutHint', icon: 'info' },
  { id: 'app-engine', labelKey: 'shell.navAppEngine', hintKey: 'shell.navAppEngineHint', icon: 'server', beta: true },
  { id: 'builder', labelKey: 'shell.navBuilder', hintKey: 'shell.navBuilderHint', icon: 'tools', beta: true },
  { id: 'beta', labelKey: 'shell.navBetaFeatures', hintKey: 'shell.navBetaFeaturesHint', icon: 'beaker', beta: true },
]

const NAV_GROUPS: ReadonlyArray<{ labelKey: string; ids: SettingsNavId[] }> = [
  { labelKey: 'shell.groupPersonalization', ids: ['personalization', 'languages', 'datetime'] },
  { labelKey: 'shell.groupConnectivity', ids: ['remote', 'accounts'] },
  { labelKey: 'shell.groupSystem', ids: ['system', 'general', 'update', 'notification', 'shortcuts'] },
  { labelKey: 'shell.groupAbout', ids: ['help-about'] },
  { labelKey: 'shell.groupAdvanced', ids: ['app-engine', 'builder', 'beta'] },
]

const NAV_BY_ID = new Map(NAV.map((item) => [item.id, item]))

const TAB_SUBTITLE_KEYS: Partial<Record<SettingsNavId, string>> = {
  personalization: 'shell.personalizationSubtitle',
  remote: 'shell.remoteSubtitle',
  system: 'shell.systemSubtitle',
  accounts: 'shell.accountsSubtitle',
  general: 'shell.generalSubtitle',
  update: 'shell.updateSubtitle',
  notification: 'shell.notificationSubtitle',
  shortcuts: 'shell.shortcutsSubtitle',
  'help-about': 'shell.helpAboutSubtitle',
  datetime: 'shell.datetimeSubtitle',
  languages: 'shell.languagesSubtitle',
  'app-engine': 'shell.appEngineSubtitle',
  builder: 'shell.builderSubtitle',
  beta: 'shell.betaSubtitle',
}

function TabContent({ id }: { id: SettingsNavId }): ReactElement {
  switch (id) {
    case 'personalization': return <SettingsPersonalization />
    case 'remote': return <SettingsRemote />
    case 'system': return <SettingsSystem />
    case 'accounts': return <SettingsAccounts />
    case 'general': return <SettingsGeneral />
    case 'update': return <SettingsUpdate />
    case 'app-engine': return <SettingsAppEngine />
    case 'builder': return <SettingsBuilder />
    case 'beta': return <SettingsBetaFeatures />
    case 'notification': return <SettingsNotification />
    case 'shortcuts': return <SettingsShortcuts />
    case 'help-about': return <SettingsHelpAbout />
    case 'datetime': return <SettingsDateTime />
    case 'languages': return <SettingsLanguages />
  }
}

export function SettingsShell(): ReactElement {
  const { t } = useTranslation('settings')
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') as SettingsNavId | null
  const validIds = NAV.map((n) => n.id)
  const [navId, setNavId] = useState<SettingsNavId>(
    rawTab && validIds.includes(rawTab) ? rawTab : 'personalization'
  )

  useEffect(() => {
    if (rawTab && validIds.includes(rawTab)) {
      setNavId(rawTab)
    }
  }, [rawTab, validIds])

  function navigate(id: SettingsNavId): void {
    setNavId(id)
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    if (id !== 'accounts') next.delete('provider')
    setSearchParams(next, { replace: true })
  }

  const activeNav = NAV_BY_ID.get(navId) ?? NAV[0]!

  return (
    <div className="settings-page elevated-page">
      <div className="settings-layout-grid">
        <aside className="settings-nav-rail" aria-label={t('shell.title')}>
          <div className="settings-nav-brand">{t('shell.title')}</div>
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="settings-nav-group">
              <div className="settings-nav-group-label">{t(group.labelKey)}</div>
              {group.ids.map((id) => {
                const item = NAV_BY_ID.get(id)
                if (!item) return null
                const active = item.id === navId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`settings-nav-button${active ? ' active' : ''}`}
                  >
                    <span className={`codicon codicon-${item.icon} settings-nav-icon`} aria-hidden />
                    <span className="settings-nav-label">{t(item.labelKey)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </aside>
        <main key={navId} className="settings-pane settings-pane-animate">
          <header className="settings-pane-header">
            <h1>{t(activeNav.labelKey)}</h1>
            {TAB_SUBTITLE_KEYS[navId] ? <p>{t(TAB_SUBTITLE_KEYS[navId]!)}</p> : null}
          </header>
          <div className="settings-pane-body">
            <TabContent id={navId} />
          </div>
        </main>
      </div>
    </div>
  )
}
