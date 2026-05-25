import type { ReactElement } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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

const NAV: ReadonlyArray<{ id: SettingsNavId; label: string; hint: string; icon: string; beta?: boolean }> = [
  { id: 'personalization', label: 'Personalization', hint: 'Colors & appearance', icon: 'color-mode' },
  { id: 'remote', label: 'SSH & remote', hint: 'Saved connections', icon: 'terminal-linux' },
  { id: 'system', label: 'System', hint: 'Hosts & environment', icon: 'inspect' },
  { id: 'accounts', label: 'Connected accounts', hint: 'GitHub & GitLab', icon: 'github' },
  { id: 'general', label: 'General', hint: 'Startup, window, telemetry', icon: 'settings' },
  { id: 'update', label: 'Update', hint: 'Release channel & checks', icon: 'arrow-circle-up' },
  { id: 'notification', label: 'Notification', hint: 'Mute, filters, OS alerts', icon: 'bell' },
  { id: 'shortcuts', label: 'Shortcuts', hint: 'Keybindings', icon: 'keyboard' },
  { id: 'help-about', label: 'Help & About', hint: 'Version & license', icon: 'info' },
  { id: 'datetime', label: 'Date & Time', hint: '12h/24h, timezone', icon: 'clock' },
  { id: 'languages', label: 'Languages', hint: 'Locale', icon: 'globe' },
  { id: 'resources', label: 'Resources', hint: 'CPU & RAM limits', icon: 'server-process', beta: true },
  { id: 'app-engine', label: 'App Engine', hint: 'IPC & daemon config', icon: 'server', beta: true },
  { id: 'builder', label: 'Builder', hint: 'Toolchain paths', icon: 'tools', beta: true },
  { id: 'extension', label: 'Extension', hint: 'Coming soon', icon: 'extensions', beta: true },
  { id: 'beta', label: 'Beta Features', hint: 'Experimental flags', icon: 'beaker', beta: true },
]

const TAB_SUBTITLES: Partial<Record<SettingsNavId, string>> = {
  personalization: 'Choose an accent color and theme for the app.',
  remote: 'These entries are the same as on the SSH page.',
  system: 'Read-only diagnostics: hosts file and process environment variables.',
  accounts: 'Overview of accounts stored for GitHub and GitLab.',
  general: 'Startup behavior, telemetry, and project home directory.',
  update: 'Release channel and update checks.',
  notification: 'Control in-app notifications and OS alert delivery.',
  shortcuts: 'Customize keyboard shortcuts for major app actions.',
  'help-about': 'App version, build info, and license.',
  datetime: 'Time format and timezone for all log timestamps.',
  languages: 'Display language (full translations in a future release).',
  resources: 'CPU and RAM limits for background job execution.',
  'app-engine': 'IPC timeouts and daemon configuration.',
  builder: 'Paths to local toolchains and registry mirrors.',
  extension: 'Plugin management coming in a future release.',
  beta: 'Toggle experimental features.',
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
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>Settings</h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Personalize LuminaDev, manage SSH targets, linked cloud Git providers, and system configuration.
        </p>
      </header>
      <div className="settings-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)', gap: 32, alignItems: 'start' }}>
        <nav aria-label="Settings categories" style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 12 }}>
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
                  <span style={{ fontWeight: 650, fontSize: 14, letterSpacing: '0.01em' }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <main key={navId} className="settings-pane-animate" style={{ minWidth: 0 }}>
          <div className="hp-card" style={{ padding: '22px 24px' }}>
            <div className="hp-card-header" style={{ marginBottom: 16 }}>
              <h2 className="hp-card-title" style={{ fontSize: 16 }}>{activeNav.label}</h2>
              {TAB_SUBTITLES[navId] ? <p className="hp-card-subtitle" style={{ fontSize: 13 }}>{TAB_SUBTITLES[navId]}</p> : null}
            </div>
            <TabContent id={navId} />
          </div>
        </main>
      </div>
    </div>
  )
}
