import type { ReactElement } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsPersonalization } from './SettingsPersonalization'
import { SettingsRemote } from './SettingsRemote'
import { SettingsSystem } from './SettingsSystem'
import { SettingsAccounts } from './SettingsAccounts'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsUpdate } from './SettingsUpdate'
import { SettingsResources } from './SettingsResources'
import { SettingsAppEngine } from './SettingsAppEngine'
import { SettingsBuilder } from './SettingsBuilder'
import { SettingsExtension } from './SettingsExtension'
import { SettingsBetaFeatures } from './SettingsBetaFeatures'
import { SettingsNotification } from './SettingsNotification'
import { SettingsShortcuts } from './SettingsShortcuts'
import { SettingsHelpAbout } from './SettingsHelpAbout'
import { SettingsDateTime } from './SettingsDateTime'
import { SettingsLanguages } from './SettingsLanguages'

type SettingsNavId =
  | 'personalization' | 'remote' | 'system' | 'accounts' | 'general' | 'update'
  | 'resources' | 'app-engine' | 'builder' | 'extension' | 'beta'
  | 'notification' | 'shortcuts' | 'help-about' | 'datetime' | 'languages'

const NAV: ReadonlyArray<{ id: SettingsNavId; labelKey: string; hintKey: string; icon: string; beta?: boolean }> = [
  { id: 'personalization', labelKey: 'shell.navPersonalization', hintKey: 'shell.navPersonalizationHint', icon: 'color-mode' },
  { id: 'remote', labelKey: 'shell.navRemote', hintKey: 'shell.navRemoteHint', icon: 'terminal-linux' },
  { id: 'system', labelKey: 'shell.navSystem', hintKey: 'shell.navSystemHint', icon: 'inspect' },
  { id: 'accounts', labelKey: 'shell.navAccounts', hintKey: 'shell.navAccountsHint', icon: 'github' },
  { id: 'general', labelKey: 'shell.navGeneral', hintKey: 'shell.navGeneralHint', icon: 'settings' },
  { id: 'update', labelKey: 'shell.navUpdate', hintKey: 'shell.navUpdateHint', icon: 'arrow-circle-up' },
  { id: 'notification', labelKey: 'shell.navNotification', hintKey: 'shell.navNotificationHint', icon: 'bell' },
  { id: 'shortcuts', labelKey: 'shell.navShortcuts', hintKey: 'shell.navShortcutsHint', icon: 'keyboard' },
  { id: 'help-about', labelKey: 'shell.navHelpAbout', hintKey: 'shell.navHelpAboutHint', icon: 'info' },
  { id: 'datetime', labelKey: 'shell.navDatetime', hintKey: 'shell.navDatetimeHint', icon: 'clock' },
  { id: 'languages', labelKey: 'shell.navLanguages', hintKey: 'shell.navLanguagesHint', icon: 'globe' },
  { id: 'resources', labelKey: 'shell.navResources', hintKey: 'shell.navResourcesHint', icon: 'server-process', beta: true },
  { id: 'app-engine', labelKey: 'shell.navAppEngine', hintKey: 'shell.navAppEngineHint', icon: 'server', beta: true },
  { id: 'builder', labelKey: 'shell.navBuilder', hintKey: 'shell.navBuilderHint', icon: 'tools', beta: true },
  { id: 'extension', labelKey: 'shell.navExtension', hintKey: 'shell.navExtensionHint', icon: 'extensions', beta: true },
  { id: 'beta', labelKey: 'shell.navBetaFeatures', hintKey: 'shell.navBetaFeaturesHint', icon: 'beaker', beta: true },
]

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
  resources: 'shell.resourcesSubtitle',
  'app-engine': 'shell.appEngineSubtitle',
  builder: 'shell.builderSubtitle',
  extension: 'shell.extensionSubtitle',
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
    case 'resources': return <SettingsResources />
    case 'app-engine': return <SettingsAppEngine />
    case 'builder': return <SettingsBuilder />
    case 'extension': return <SettingsExtension />
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

  function navigate(id: SettingsNavId): void {
    setNavId(id)
    setSearchParams({ tab: id }, { replace: true })
  }

  const activeNav = NAV.find((n) => n.id === navId) ?? NAV[0]!

  return (
    <div className="settings-page elevated-page" style={{ padding: '28px 32px 48px', maxWidth: 1040 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>{t('shell.title')}</h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          {t('shell.description')}
        </p>
      </header>
      <div className="settings-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)', gap: 32, alignItems: 'start' }}>
        <nav aria-label={t('shell.title')} style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 12 }}>
          {NAV.map((item) => {
            const active = item.id === navId
            return (
              <button key={item.id} type="button" onClick={() => navigate(item.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid',
                  borderColor: active ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'transparent',
                  background: active ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-widget))' : 'color-mix(in srgb, var(--bg-widget) 88%, transparent)',
                  color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease',
                  boxShadow: active ? '0 1px 0 rgba(255,255,255,0.04)' : 'none' }}>
                <span className={`codicon codicon-${item.icon}`}
                  style={{ fontSize: 20, marginTop: 2, opacity: active ? 1 : 0.85, color: active ? 'var(--accent)' : 'var(--text-muted)' }} aria-hidden />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 650, fontSize: 14, letterSpacing: '0.01em' }}>{t(item.labelKey)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{t(item.hintKey)}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <main key={navId} className="settings-pane-animate" style={{ minWidth: 0 }}>
          <div className="hp-card" style={{ padding: '22px 24px' }}>
            <div className="hp-card-header" style={{ marginBottom: 16 }}>
              <h2 className="hp-card-title" style={{ fontSize: 16 }}>{t(activeNav.labelKey)}</h2>
              {TAB_SUBTITLE_KEYS[navId] ? <p className="hp-card-subtitle" style={{ fontSize: 13 }}>{t(TAB_SUBTITLE_KEYS[navId]!)}</p> : null}
            </div>
            <TabContent id={navId} />
          </div>
        </main>
      </div>
    </div>
  )
}
