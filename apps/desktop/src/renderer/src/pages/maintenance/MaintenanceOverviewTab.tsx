import type { ContainerRow, HostMetricsResponse, HostSecuritySnapshot, TopProcessRow } from '@linux-dev-home/shared'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import { getGuardianLayerPressureScore } from '../maintenanceHealth'
import { getMaintenanceOverallLabel } from '../maintenanceHealth'
import { GUARDIAN_LAYER_LABELS } from './constants'
import { GuardianLayerTile, OverviewNav } from './MaintenanceUi'
import type { GuardianLayerId } from '../maintenanceGuardian'
import type { TabId } from './types'

type Guardian = ReturnType<typeof import('../maintenanceGuardian').evaluateGuardian>

export function MaintenanceOverviewTab({
  t,
  activeJobCount,
  onOpenLogsTab,
  guardian,
  guardianOverallLevel,
  m,
  memPct,
  diskPct,
  runningContainers,
  containers,
  topProcesses,
  security,
  pendingTasks,
  onOpenTab,
  onGuardianLayerAction,
  onOpenScheduleTab,
  onUpdateTaskDone,
}: {
  t: TFunction<'maintenance'>
  activeJobCount: number
  onOpenLogsTab: () => void
  guardian: Guardian
  guardianOverallLevel: ReturnType<typeof import('../maintenanceHealth').getMaintenanceOverallLevel>
  m: HostMetricsResponse['metrics'] | undefined
  memPct: number | null
  diskPct: number | null
  runningContainers: number
  containers: ContainerRow[]
  topProcesses: TopProcessRow[]
  security: HostSecuritySnapshot | null
  pendingTasks: Array<{ id: string; title: string; done: boolean }>
  onOpenTab: (tab: TabId) => void
  onGuardianLayerAction: (layerId: GuardianLayerId) => void
  onOpenScheduleTab: () => void
  onUpdateTaskDone: (taskId: string, done: boolean) => void
}): ReactElement {
  return (
    <section className="maint-panel">
      {activeJobCount > 0 ? (
        <div className="maint-job-banner">
          <span className="maint-job-banner-text">
            <strong>{activeJobCount}</strong> job{activeJobCount === 1 ? '' : 's'} running (install, diagnostics, etc.).
          </span>
          <button type="button" className="hp-btn hp-btn-primary maint-job-banner-btn" onClick={onOpenLogsTab}>
            {t('page.viewJobRunner')}
          </button>
        </div>
      ) : null}
      <div className="maint-guardian-card maint-guardian-card--solo">
        <div className="maint-guardian-card-bar" aria-hidden />
        <div className="maint-section-head">{t('section.systemOverview')}</div>
        <div className="maint-score-hero">
          <div className="maint-score-ring" aria-hidden>
            <svg viewBox="0 0 120 120" className="maint-score-ring-svg">
              <circle className="maint-score-ring-track" cx="60" cy="60" r="52" />
              <circle
                className={`maint-score-ring-fill is-${guardianOverallLevel}`}
                cx="60"
                cy="60"
                r="52"
                strokeDasharray={`${((guardian.score ?? 0) / 100) * 326.7} 326.7`}
              />
            </svg>
            <div className="maint-score-ring-label">{guardian.score === null ? '—' : `${guardian.score}%`}</div>
          </div>
          <div className="maint-score-copy">
            <div className="maint-score-sub">{t('health.guardianHealth')}</div>
            {guardian.score != null ? (
              <span className={`maint-overall-badge is-${guardianOverallLevel}`}>
                <span className="maint-overall-dot" aria-hidden />
                {getMaintenanceOverallLabel(guardianOverallLevel, t)}
              </span>
            ) : null}
            <p className="maint-real-data-note">{t('overview.realDataNote')}</p>
            <div className="maint-kpi-row">
              <span className="maint-kpi">CPU {m?.cpuUsagePercent.toFixed(1) ?? '—'}%</span>
              <span className="maint-kpi">Mem {memPct ?? '—'}%</span>
              <span className="maint-kpi">Disk {diskPct ?? '—'}%</span>
              <span className="maint-kpi">
                Docker {runningContainers}/{containers.length}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="maint-divider">
        <div className="maint-section-head">{t('section.guardianLayers')}</div>
        <p className="maint-section-lead">
          <Trans i18nKey="guardian.description" ns="maintenance" t={t} components={{ 0: <strong /> }} />
        </p>
        <div className="maint-layer-grid">
          {guardian.layers.map((layer) => (
            <GuardianLayerTile
              key={layer.id}
              layerId={layer.id}
              title={t(GUARDIAN_LAYER_LABELS[layer.id] ?? layer.title)}
              signals={layer.signals}
              detail={layer.detail}
              deduction={layer.deduction}
              ok={layer.ok}
              pressureScore={getGuardianLayerPressureScore(layer.id, m, containers, topProcesses, security)}
              onAction={onGuardianLayerAction}
            />
          ))}
        </div>
        <div className="maint-checklist-block">
          <div className="maint-section-head">{t('section.yourChecklist')}</div>
          <p className="maint-section-lead">{t('overview.checklistLead')}</p>
          {pendingTasks.length === 0 ? (
            <div className="hp-muted maint-checklist-empty">{t('checklist.noTasks')}</div>
          ) : (
            <ul className="maint-checklist">
              {pendingTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="maint-checklist-item">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => onUpdateTaskDone(task.id, !task.done)}
                    aria-label={`Done: ${task.title}`}
                  />
                  <span>{task.title}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="hp-btn maint-checklist-btn" onClick={onOpenScheduleTab}>
            {t('checklist.openSchedule')}
          </button>
        </div>
        <OverviewNav onOpenTab={onOpenTab} />
      </div>
    </section>
  )
}
