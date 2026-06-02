import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { parseAppearance } from '@linux-dev-home/shared'
import {
  applyAppearanceAccent,
  applyTheme,
  DEFAULT_ACCENT_HEX,
  type ThemeMode,
} from '../../theme/applyAccent'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsFeedback,
  SettingsSegmented,
  SettingsStack,
} from './SettingsUi'

const ACCENT_PRESETS: ReadonlyArray<{ labelKey: string; hex: string }> = [
  { labelKey: 'personalization.accentViolet', hex: '#7c4dff' },
  { labelKey: 'personalization.accentBlue', hex: '#1976d2' },
  { labelKey: 'personalization.accentGreen', hex: '#43a047' },
  { labelKey: 'personalization.accentCoral', hex: '#ff7043' },
  { labelKey: 'personalization.accentTeal', hex: '#00897b' },
]

export function SettingsPersonalization(): ReactElement {
  const { t } = useTranslation('settings')
  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')

  useEffect(() => {
    void window.dh.storeGet({ key: 'appearance' }).then((ap) => {
      if (ap.ok) {
        const parsed = parseAppearance(ap.data)
        setAccentDraft(parsed.accent ?? DEFAULT_ACCENT_HEX)
        const stored = parsed.theme ?? 'dark'
        setThemeMode(stored)
        applyTheme(stored)
      }
    })
  }, [])

  async function persistAppearance(patch: { accent?: string; theme?: ThemeMode }): Promise<void> {
    const current = await window.dh.storeGet({ key: 'appearance' })
    const base = current.ok ? parseAppearance(current.data) : {}
    const res = await window.dh.storeSet({
      key: 'appearance',
      data: {
        accent: patch.accent ?? base.accent ?? accentDraft,
        theme: patch.theme ?? base.theme ?? themeMode,
      },
    })
    assertSettingsOk(res)
  }

  async function onThemeChange(mode: ThemeMode): Promise<void> {
    setThemeMode(mode)
    applyTheme(mode)
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      await persistAppearance({ theme: mode })
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : t('personalization.saveFailed'))
    } finally {
      setAccentBusy(false)
    }
  }

  async function saveAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      await persistAppearance({ accent: accentDraft, theme: themeMode })
      applyAppearanceAccent(accentDraft)
      applyTheme(themeMode)
      setAccentMsg(t('personalization.accentSaved'))
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : t('personalization.saveFailed'))
    } finally {
      setAccentBusy(false)
    }
  }

  async function resetAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      await persistAppearance({ theme: themeMode })
      setAccentDraft(DEFAULT_ACCENT_HEX)
      applyAppearanceAccent(undefined)
      applyTheme(themeMode)
      setAccentMsg(t('personalization.defaultRestored'))
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : t('personalization.resetFailed'))
    } finally {
      setAccentBusy(false)
    }
  }

  const msgTone =
    accentMsg &&
    (accentMsg.toLowerCase().includes('could not') || accentMsg.toLowerCase().includes('failed'))
      ? 'error'
      : 'success'

  return (
    <SettingsStack>
      <SettingsCard title={t('personalization.colorTheme')} description={t('personalization.colorThemeDesc')}>
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'flex-end' }}>
          <SettingsSegmented
            value={themeMode}
            options={[
              { value: 'dark', label: t('personalization.dark'), icon: 'moon' },
              { value: 'light', label: t('personalization.light'), icon: 'sun' },
              {
                value: 'high-contrast',
                label: t('personalization.highContrast'),
                icon: 'eye',
              },
            ]}
            onChange={(mode) => void onThemeChange(mode)}
          />
        </div>
      </SettingsCard>
      <SettingsCard title={t('personalization.accentColor')} description={t('personalization.accentColorDesc')}>
        <div
          style={{
            padding: '12px 0 4px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={t(p.labelKey)}
              className={`settings-color-swatch${accentDraft.toLowerCase() === p.hex ? ' active' : ''}`}
              style={{ background: p.hex }}
              onClick={() => setAccentDraft(p.hex)}
            />
          ))}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            {t('personalization.custom')}
            <input
              type="color"
              value={accentDraft}
              onChange={(ev) => setAccentDraft(ev.target.value)}
              style={{
                width: 40,
                height: 36,
                padding: 0,
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
          </label>
        </div>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" disabled={accentBusy} onClick={() => void saveAccent()}>
          {t('personalization.save')}
        </button>
        <button type="button" className="hp-btn" disabled={accentBusy} onClick={() => void resetAccent()}>
          {t('personalization.resetToDefault')}
        </button>
      </SettingsActions>
      {accentMsg ? <SettingsFeedback tone={msgTone}>{accentMsg}</SettingsFeedback> : null}
    </SettingsStack>
  )
}
