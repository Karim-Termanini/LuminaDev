import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsFeedback,
  SettingsRow,
  SettingsStack,
  SettingsToggle,
} from './SettingsUi'

export function SettingsGeneral(): ReactElement {
  const { t } = useTranslation('settings')
  const [generalSettings, setGeneralSettings] = useState<{ startupBehavior?: string; windowSize?: { width: number; height: number }; telemetry?: boolean }>({})
  const [generalMsg, setGeneralMsg] = useState<string | null>(null)
  const [generalBusy, setGeneralBusy] = useState(false)
  const [wizardResetMsg, setWizardResetMsg] = useState<string | null>(null)
  const [wizardResetBusy, setWizardResetBusy] = useState(false)
  const [projectsHomeDir, setProjectsHomeDir] = useState('~/LuminaProjects')
  const [projectsHomeDirBusy, setProjectsHomeDirBusy] = useState(false)
  const [projectsHomeDirMsg, setProjectsHomeDirMsg] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      window.dh.storeGet({ key: 'general_settings' }),
      window.dh.storeGet({ key: 'projects_home_dir' }),
    ]).then(([gs, phd]) => {
      if (gs.ok && gs.data && typeof gs.data === 'object') setGeneralSettings(gs.data as typeof generalSettings)
      if (phd.ok && typeof phd.data === 'string' && phd.data.trim()) setProjectsHomeDir(phd.data.trim())
    })
  }, [])

  async function saveGeneralSettings(): Promise<void> {
    setGeneralBusy(true)
    setGeneralMsg(null)
    try {
      const data = {
        startupBehavior: generalSettings.startupBehavior as 'default' | 'minimized' | undefined,
        windowSize: generalSettings.windowSize,
        telemetry: generalSettings.telemetry,
      }
      const res = await window.dh.storeSet({ key: 'general_settings', data })
      assertSettingsOk(res)
      setGeneralMsg(t('general.saved'))
      setTimeout(() => setGeneralMsg(null), 3000)
    } catch (e) {
      setGeneralMsg(e instanceof Error ? e.message : t('general.saveFailed'))
    } finally {
      setGeneralBusy(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard title={t('general.startupBehavior')}>
        <SettingsRow label={t('general.startupBehavior')} last>
          <select
            value={(generalSettings.startupBehavior ?? 'default') as string}
            onChange={(e) => setGeneralSettings((p) => ({ ...p, startupBehavior: e.target.value as 'default' | 'minimized' }))}
            className="hp-input"
            style={{ fontSize: 13, minWidth: 180 }}
          >
            <option value="default">{t('general.startupDefault')}</option>
            <option value="minimized">{t('general.startupMinimized')}</option>
          </select>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={t('general.telemetry')}>
        <SettingsRow label={t('general.telemetryLabel')} last>
          <SettingsToggle
            checked={generalSettings.telemetry ?? false}
            onChange={(v) => setGeneralSettings((p) => ({ ...p, telemetry: v }))}
          />
        </SettingsRow>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveGeneralSettings()} disabled={generalBusy}>
          {generalBusy ? t('general.saving') : t('general.save')}
        </button>
      </SettingsActions>
      {generalMsg ? (
        <SettingsFeedback tone={generalMsg === t('general.saved') ? 'success' : 'error'}>{generalMsg}</SettingsFeedback>
      ) : null}

      <SettingsCard title={t('general.projectsHomeDir')} description={t('general.projectsHomeDirDesc')}>
        <SettingsRow label={t('general.projectsHomeDir')} description={t('general.projectsHomeDirDesc')} last>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input
              type="text"
              className="hp-input"
              style={{ fontSize: 13, minWidth: 200, flex: '1 1 200px' }}
              value={projectsHomeDir}
              onChange={(e) => setProjectsHomeDir(e.target.value)}
              placeholder={t('general.projectsHomePlaceholder')}
            />
            <button
              type="button"
              className="hp-btn"
              title={t('general.browseForFolder')}
              onClick={() => { void window.dh.selectFolder().then((p) => { if (p) setProjectsHomeDir(p) }) }}
            >
              <span className="codicon codicon-folder-open" aria-hidden />
            </button>
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              disabled={projectsHomeDirBusy || !projectsHomeDir.trim()}
              onClick={() => {
                setProjectsHomeDirBusy(true)
                setProjectsHomeDirMsg(null)
                void window.dh.storeSet({ key: 'projects_home_dir', data: projectsHomeDir.trim() })
                  .then(() => { setProjectsHomeDirMsg(t('general.saved')) })
                  .catch((e: unknown) => { setProjectsHomeDirMsg(e instanceof Error ? e.message : t('general.saveFailed')) })
                  .finally(() => {
                    setProjectsHomeDirBusy(false)
                    setTimeout(() => setProjectsHomeDirMsg(null), 3000)
                  })
              }}
            >
              {projectsHomeDirBusy ? t('general.saving') : t('general.save')}
            </button>
          </div>
        </SettingsRow>
      </SettingsCard>
      {projectsHomeDirMsg ? (
        <SettingsFeedback tone={projectsHomeDirMsg === t('general.saved') ? 'success' : 'error'}>{projectsHomeDirMsg}</SettingsFeedback>
      ) : null}

      <SettingsCard title={t('general.dangerZone')} description={t('general.dangerZoneDesc')} className="settings-danger-card">
        <SettingsRow label={t('general.runSetupWizard')} description={t('general.dangerZoneDesc')} last>
          <button
            type="button"
            className="hp-btn"
            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
            disabled={wizardResetBusy}
            onClick={() => {
              setWizardResetBusy(true)
              setWizardResetMsg(null)
              void window.dh.storeSet({ key: 'readiness_wizard_complete', data: false })
                .then(() => setWizardResetMsg(t('general.wizardResetSuccess')))
                .catch((e: unknown) => setWizardResetMsg(e instanceof Error ? e.message : t('general.wizardResetFailed')))
                .finally(() => setWizardResetBusy(false))
            }}
          >
            <span className="codicon codicon-refresh" aria-hidden />
            {wizardResetBusy ? t('general.resetting') : t('general.runSetupWizard')}
          </button>
        </SettingsRow>
      </SettingsCard>
      {wizardResetMsg ? <SettingsFeedback tone="muted">{wizardResetMsg}</SettingsFeedback> : null}
    </SettingsStack>
  )
}
