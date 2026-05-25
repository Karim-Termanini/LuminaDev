import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

export function SettingsGeneral(): ReactElement {
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
      setGeneralMsg('Saved.')
      setTimeout(() => setGeneralMsg(null), 3000)
    } catch (e) {
      setGeneralMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setGeneralBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Startup behavior</div>
        <select value={(generalSettings.startupBehavior ?? 'default') as string}
          onChange={(e) => setGeneralSettings((p) => ({ ...p, startupBehavior: e.target.value as 'default' | 'minimized' }))}
          className="hp-input" style={{ fontSize: 13 }}>
          <option value="default">Default (show app window)</option>
          <option value="minimized">Minimized (start in background)</option>
        </select>
      </div>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Telemetry</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={generalSettings.telemetry ?? false}
            onChange={(e) => setGeneralSettings((p) => ({ ...p, telemetry: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Send usage data to help improve LuminaDev</span>
        </label>
      </div>
      <div style={{ paddingTop: 8 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveGeneralSettings()} disabled={generalBusy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {generalBusy ? 'Saving…' : 'Save'}
        </button>
        {generalMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: generalMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{generalMsg}</p> : null}
      </div>
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Projects Home Directory</div>
        <p className="hp-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Where new projects are scaffolded. Set during setup wizard — change here any time.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" className="hp-input" style={{ fontSize: 13, flex: 1, minWidth: 200 }}
            value={projectsHomeDir} onChange={(e) => setProjectsHomeDir(e.target.value)} placeholder="~/LuminaProjects" />
          <button type="button" className="hp-btn" style={{ fontSize: 13, padding: '8px 12px' }} title="Browse for folder"
            onClick={() => { void window.dh.selectFolder().then((p) => { if (p) setProjectsHomeDir(p) }) }}>
            <span className="codicon codicon-folder-open" aria-hidden />
          </button>
          <button type="button" className="hp-btn hp-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}
            disabled={projectsHomeDirBusy || !projectsHomeDir.trim()}
            onClick={() => {
              setProjectsHomeDirBusy(true)
              setProjectsHomeDirMsg(null)
              void window.dh.storeSet({ key: 'projects_home_dir', data: projectsHomeDir.trim() })
                .then(() => { setProjectsHomeDirMsg('Saved.') })
                .catch((e: unknown) => { setProjectsHomeDirMsg(e instanceof Error ? e.message : 'Save failed.') })
                .finally(() => {
                  setProjectsHomeDirBusy(false)
                  setTimeout(() => setProjectsHomeDirMsg(null), 3000)
                })
            }}>
            {projectsHomeDirBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {projectsHomeDirMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: projectsHomeDirMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{projectsHomeDirMsg}</p> : null}
      </div>
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--red)' }}>Danger Zone</div>
        <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Reset the setup wizard so it runs again on next app launch. Useful if you changed your system configuration or want to reconfigure Git identity and profile preferences.
        </p>
        <button type="button" className="hp-btn" style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--red)', color: 'var(--red)' }}
          disabled={wizardResetBusy}
          onClick={() => {
            setWizardResetBusy(true)
            setWizardResetMsg(null)
            void window.dh.storeSet({ key: 'readiness_wizard_complete', data: false })
              .then(() => setWizardResetMsg('Setup wizard will run on next launch.'))
              .catch((e: unknown) => setWizardResetMsg(e instanceof Error ? e.message : 'Failed to reset wizard.'))
              .finally(() => setWizardResetBusy(false))
          }}>
          <span className="codicon codicon-refresh" aria-hidden />
          {wizardResetBusy ? 'Resetting…' : 'Run Setup Wizard Again'}
        </button>
        {wizardResetMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{wizardResetMsg}</p> : null}
      </div>
    </div>
  )
}
