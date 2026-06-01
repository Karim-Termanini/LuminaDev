import type { ComposeProfile, MaintenanceStateStore } from '@linux-dev-home/shared'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { profileIds } from './constants'
import { StatusPill, SystemdServiceTile } from './MaintenanceUi'
import type { ServiceState } from './types'
import { MAINTENANCE_SYSTEMD_SERVICES, type SystemdServiceId } from '../maintenanceSystemdServices'

export function MaintenanceDataProfilesTab({
  t,
  state,
  savingState,
  serviceState,
  systemdBusy,
  systemdError,
  onCheckAllProfiles,
  onRefreshSystemd,
  onCheckProfile,
  onRunProfile,
  onStartSystemd,
}: {
  t: TFunction<'maintenance'>
  state: MaintenanceStateStore
  savingState: boolean
  serviceState: ServiceState
  systemdBusy: Partial<Record<SystemdServiceId, boolean>>
  systemdError: Partial<Record<SystemdServiceId, string>>
  onCheckAllProfiles: () => void
  onRefreshSystemd: () => void
  onCheckProfile: (profile: ComposeProfile) => void
  onRunProfile: (profile: ComposeProfile) => void
  onStartSystemd: (id: SystemdServiceId) => void
}): ReactElement {
  return (
    <section className="maint-panel">
      <div className="maint-section-head">{t('section.infrastructureStatus')}</div>
      <p className="maint-section-lead">{t('infra.lead')}</p>
      <div className="hp-row-wrap maint-infra-toolbar">
        <button className="hp-btn" onClick={() => void onCheckAllProfiles()} disabled={savingState}>
          {t('infra.checkAllProfiles')}
        </button>
        <button className="hp-btn" onClick={() => void onRefreshSystemd()} disabled={savingState}>
          {t('infra.refreshSystemd')}
        </button>
      </div>
      <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
        <table className="hp-table">
          <thead>
            <tr className="hp-table-head">
              <th className="hp-table-cell">{t('infra.profile')}</th>
              <th className="hp-table-cell">{t('infra.health')}</th>
              <th className="hp-table-cell">{t('infra.lastChecked')}</th>
              <th className="hp-table-cell">{t('infra.lastRun')}</th>
              <th className="hp-table-cell">{t('infra.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {profileIds.map((profile) => {
              const entry = state.profileHealth.find((p) => p.profile === profile)
              return (
                <tr key={profile} className="hp-table-row">
                  <td className="hp-table-cell">{profile}</td>
                  <td className="hp-table-cell">
                    <StatusPill state={entry?.health ?? 'unknown'} />
                  </td>
                  <td className="hp-table-cell mono">{entry?.lastCheckedAtIso ?? '-'}</td>
                  <td className="hp-table-cell mono">{entry?.lastRunAtIso ?? '-'}</td>
                  <td className="hp-table-cell">
                    <div className="hp-row-wrap">
                      <button className="hp-btn" onClick={() => void onCheckProfile(profile)} disabled={savingState}>
                        {t('infra.check')}
                      </button>
                      <button className="hp-btn" onClick={() => void onRunProfile(profile)} disabled={savingState}>
                        {t('infra.run')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="maint-section-head maint-section-head-spaced">{t('infra.systemServices')}</div>
      <p className="maint-section-lead">{t('infra.systemServicesLead')}</p>
      <div className="maint-systemd-grid">
        {MAINTENANCE_SYSTEMD_SERVICES.map((svc) => (
          <SystemdServiceTile
            key={svc.id}
            serviceId={svc.id}
            state={serviceState[svc.id] ?? 'unknown'}
            busy={Boolean(systemdBusy[svc.id])}
            error={systemdError[svc.id]}
            optional={svc.optional}
            onStart={() => void onStartSystemd(svc.id)}
          />
        ))}
      </div>
    </section>
  )
}
