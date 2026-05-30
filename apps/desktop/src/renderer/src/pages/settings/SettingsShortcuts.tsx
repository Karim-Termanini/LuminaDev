import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ShortcutsSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsDataTable,
  SettingsFeedback,
  SettingsStack,
} from './SettingsUi'

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

// eslint-disable-next-line react-refresh/only-export-components
export function buildChord(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: string }): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join('+')
}

const DEFAULT_ACTIONS: ReadonlyArray<{ key: string; labelKey: string; defaultBinding: string }> = [
  { key: 'open_terminal', labelKey: 'shortcuts.openTerminal', defaultBinding: 'Ctrl+Alt+T' },
  { key: 'toggle_sidebar', labelKey: 'shortcuts.toggleSidebar', defaultBinding: 'Ctrl+B' },
  { key: 'focus_search', labelKey: 'shortcuts.focusSearch', defaultBinding: 'Ctrl+K' },
  { key: 'go_dashboard', labelKey: 'shortcuts.goDashboard', defaultBinding: 'Alt+1' },
  { key: 'go_system', labelKey: 'shortcuts.goSystem', defaultBinding: 'Alt+2' },
  { key: 'go_docker', labelKey: 'shortcuts.goDocker', defaultBinding: 'Alt+3' },
  { key: 'go_git', labelKey: 'shortcuts.goGit', defaultBinding: 'Alt+4' },
  { key: 'go_profiles', labelKey: 'shortcuts.goProfiles', defaultBinding: 'Alt+5' },
  { key: 'go_runtimes', labelKey: 'shortcuts.goRuntimes', defaultBinding: 'Alt+6' },
  { key: 'go_maintenance', labelKey: 'shortcuts.goMaintenance', defaultBinding: 'Alt+7' },
  { key: 'go_settings', labelKey: 'shortcuts.goSettings', defaultBinding: 'Ctrl+,' },
]

export function SettingsShortcuts(): ReactElement {
  const { t } = useTranslation('settings')
  const [bindings, setBindings] = useState<ShortcutsSettings>(() =>
    Object.fromEntries(DEFAULT_ACTIONS.map((a) => [a.key, a.defaultBinding]))
  )
  const [recording, setRecording] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object' && Object.keys(res.data).length > 0) {
        setBindings((prev) => ({ ...prev, ...(res.data as ShortcutsSettings) }))
      }
    })
  }, [])

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const chord = buildChord(e)
      if (chord && recording) {
        setBindings((p) => ({ ...p, [recording]: chord }))
        setRecording(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'shortcuts_settings', data: bindings }))
      window.dispatchEvent(new CustomEvent('dh:shortcuts:updated'))
      setMsg(t('shortcuts.saved'))
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('shortcuts.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard description={t('shortcuts.instructions')}>
        <SettingsDataTable>
          <thead>
            <tr>
              <th>{t('shortcuts.action')}</th>
              <th>{t('shortcuts.binding')}</th>
              <th style={{ width: 88 }} />
            </tr>
          </thead>
          <tbody>
            {DEFAULT_ACTIONS.map((action) => (
              <tr key={action.key}>
                <td>{t(action.labelKey)}</td>
                <td>
                  {recording === action.key ? (
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' }}>{t('shortcuts.pressKeys')}</span>
                  ) : (
                    <span className="mono" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                      {bindings[action.key] ?? action.defaultBinding}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="hp-btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setRecording(recording === action.key ? null : action.key)}
                  >
                    {recording === action.key ? t('shortcuts.cancel') : t('shortcuts.record')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </SettingsDataTable>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy || !!recording}>
          {busy ? t('shortcuts.saving') : t('shortcuts.saveAll')}
        </button>
      </SettingsActions>
      {msg ? (
        <SettingsFeedback tone={msg === t('shortcuts.saved') ? 'success' : 'error'}>{msg}</SettingsFeedback>
      ) : null}
    </SettingsStack>
  )
}
