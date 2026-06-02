import React, { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import { SettingsCard, SettingsRow, SettingsStack, SettingsToggle } from './SettingsUi'

const Flags = [
  {
    key: 'enable_experimental_terminal_multiplexer',
    labelKey: 'beta.labelExperimentalTerminalMultiplexer',
    descKey: 'beta.descExperimentalTerminalMultiplexer',
  },
  {
    key: 'enable_profile_auto_switch',
    labelKey: 'beta.labelAutoSwitchProfile',
    descKey: 'beta.descAutoSwitchProfile',
  },
]

export const SettingsBetaFeatures: React.FC = () => {
  const { t } = useTranslation('settings')
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const loadFlags = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await window.dh.storeGet({ key: 'beta_features_state' })
        assertSettingsOk(res)
        setFlags((res.data as Record<string, boolean>) ?? {})
      } catch (e) {
        setError(e instanceof Error ? e.message : t('beta.loadFailed'))
      } finally {
        setLoading(false)
      }
    }

    void loadFlags()
  }, [t])

  const handleToggle = async (key: string) => {
    try {
      setSaving((prev) => ({ ...prev, [key]: true }))
      const res = await window.dh.storeSet({
        key: 'beta_features_state',
        data: { ...flags, [key]: !flags[key] },
      })
      assertSettingsOk(res)
      setFlags((prev) => ({ ...prev, [key]: !prev[key] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('beta.saveFailed'))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  if (loading) {
    return <p className="settings-feedback settings-feedback-muted">{t('beta.loading')}</p>
  }

  return (
    <SettingsStack>
      <div className="hp-status-alert warning" style={{ margin: 0 }}>
        <span className="codicon codicon-warning" aria-hidden /> {t('beta.warning')}
      </div>
      {error ? <div className="hp-status-alert error">{error}</div> : null}
      <SettingsCard>
        {Flags.map(({ key, labelKey, descKey }, i) => (
          <SettingsRow
            key={key}
            label={t(labelKey)}
            description={descKey ? t(descKey) : undefined}
            last={i === Flags.length - 1}
          >
            <SettingsToggle
              checked={flags[key] ?? false}
              onChange={() => void handleToggle(key)}
              disabled={!!saving[key]}
            />
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsStack>
  )
}
