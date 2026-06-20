import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { humanizeMaintenanceDiagnostic } from '../maintenanceDiagnosticsHumanize'
import {
  getGuardianLayerTooltip,
  getMaintenancePressureColor,
  getMaintenancePressureDescription,
  getMaintenancePressureLabel,
  getMaintenancePressureLevel,
} from '../maintenanceHealth'
import { OPS_RUNBOOK, type RunbookOp } from '../maintenancePageHelpers'
import {
  MAINTENANCE_SYSTEMD_SERVICES,
  type SystemdServiceId,
  type SystemdServiceState,
} from '../maintenanceSystemdServices'
import { GUARDIAN_LAYER_META, OVERVIEW_NAV } from './constants'
import { getGuardianLayerActionLabelKey } from './maintenanceGuardianActions'
import type { DiagnosticCheck, TabId } from './types'
import type { GuardianLayerId } from '../maintenanceGuardian'

export function GuardianLayerTile({
  layerId,
  title,
  signals,
  detail,
  deduction,
  ok,
  pressureScore,
  onAction,
}: {
  layerId: string
  title: string
  signals: string
  detail: string
  deduction: number
  ok: boolean
  pressureScore: number | null
  onAction: (layerId: GuardianLayerId) => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const level = getMaintenancePressureLevel(pressureScore)
  const tooltip = getGuardianLayerTooltip(layerId as Parameters<typeof getGuardianLayerTooltip>[0], t)
  const meta = GUARDIAN_LAYER_META[layerId] ?? { icon: 'info', tone: 'default' }
  const actionLabelKey = getGuardianLayerActionLabelKey(layerId as GuardianLayerId, level)

  return (
    <button
      type="button"
      className={`maint-layer-tile maint-tone-${meta.tone} ${ok ? 'maint-layer-tile--ok' : 'maint-layer-tile--warn'}`}
      title={tooltip}
      aria-label={`${title}. ${t(actionLabelKey)}`}
      onClick={() => onAction(layerId as GuardianLayerId)}
    >
      <div className="maint-layer-tile-bar" aria-hidden />
      <div className="maint-layer-head">
        <div className="maint-layer-title-row">
          <span className={`maint-layer-icon-wrap maint-tone-${meta.tone}`} aria-hidden>
            <span className={`codicon codicon-${meta.icon}`} />
          </span>
          <div className="maint-layer-title" title={tooltip}>
            {title}
          </div>
        </div>
        {pressureScore != null ? (
          <div className="maint-layer-score-row">
            <span className="maint-layer-score-num">{Math.round(pressureScore)}/100</span>
            {level ? (
              <span className={`maint-layer-status is-${level}`}>
                <span className="maint-layer-status-dot" style={{ background: getMaintenancePressureColor(level) }} aria-hidden />
                {getMaintenancePressureLabel(level, t)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="hp-muted maint-layer-waiting">{t('layerPressure.waiting')}</span>
        )}
      </div>

      {pressureScore != null && level ? (
        <>
          <div className="maint-layer-bar" aria-hidden>
            <div
              className={`maint-layer-bar-fill is-${level}`}
              style={{ width: `${Math.round(pressureScore)}%` }}
            />
          </div>
          <p className={`maint-layer-hint is-${level}`} role="status">
            {getMaintenancePressureDescription(level, t)}
          </p>
        </>
      ) : null}

      <div className="hp-muted maint-layer-signals">{signals}</div>
      <div className="maint-layer-detail">{detail}</div>
      <div className={`maint-layer-deduction ${deduction > 0 ? 'is-warn' : 'is-ok'}`}>
        {deduction > 0 ? `−${deduction} pts` : '−0 pts'}
      </div>
      <div className="maint-layer-action">
        <span>{t(actionLabelKey)}</span>
        <span className="codicon codicon-chevron-right" aria-hidden />
      </div>
    </button>
  )
}

export function MaintenanceRunbookStrip({
  runbookBusyId,
  onRun,
}: {
  runbookBusyId: string | null
  onRun: (op: RunbookOp) => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  return (
    <>
      <div className="maint-runbook-label">{t('runbook.label')}</div>
      <p className="maint-section-lead maint-runbook-lead">{t('runbook.lead')}</p>
      <div className="maint-runbook-grid">
        {OPS_RUNBOOK.map((op) => (
          <button
            key={op.id}
            type="button"
            className="maint-runbook-tile"
            disabled={runbookBusyId !== null}
            onClick={() => void onRun(op)}
          >
            <span className={`codicon codicon-${op.icon}`} aria-hidden />
            <span className="maint-runbook-tile-copy">
              <strong>{runbookBusyId === op.id ? t('runbook.running') : t(op.labelKey)}</strong>
              <span className="hp-muted">{t(op.descKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

export function SystemdServiceTile({
  serviceId,
  state,
  busy,
  error,
  optional,
  onStart,
}: {
  serviceId: SystemdServiceId
  state: SystemdServiceState
  busy: boolean
  error?: string
  optional: boolean
  onStart: () => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const def = MAINTENANCE_SYSTEMD_SERVICES.find((s) => s.id === serviceId)
  if (!def) return <></>

  const showStart = state === 'inactive' || state === 'unknown'
  const notInstalled = state === 'not_installed'

  return (
    <div className={`maint-systemd-tile is-${state}`}>
      <div className="maint-systemd-head">
        <span className={`maint-systemd-icon codicon codicon-${def.icon}`} aria-hidden />
        <div className="maint-systemd-copy">
          <strong>{t(def.titleKey)}</strong>
          <span className="hp-muted">{t(def.descKey)}</span>
        </div>
        <StatusPill state={notInstalled ? 'not_installed' : state} />
      </div>
      {error && !notInstalled ? <div className="maint-systemd-error">{error}</div> : null}
      {notInstalled ? (
        <div className="maint-systemd-ok hp-muted">
          {optional ? t('systemd.notInstalledOptional') : t('systemd.notInstalled')}
        </div>
      ) : showStart ? (
        <button type="button" className="hp-btn hp-btn-primary maint-systemd-start" disabled={busy} onClick={onStart}>
          <span className="codicon codicon-play" aria-hidden />
          {busy ? t('systemd.starting') : t('systemd.start')}
        </button>
      ) : (
        <div className="maint-systemd-ok hp-muted">{t('systemd.running')}</div>
      )}
    </div>
  )
}

export function OverviewNav({
  onOpenTab,
}: {
  onOpenTab: (tab: TabId) => void
}): ReactElement {
  const { t } = useTranslation('maintenance')
  return (
    <div className="maint-overview-nav">
      <div className="maint-section-head">{t('overview.navTitle')}</div>
      <p className="maint-section-lead">{t('overview.navLead')}</p>
      <div className="maint-overview-nav-grid">
        {OVERVIEW_NAV.map((item) => (
          <button key={item.tab} type="button" className="maint-overview-nav-card" onClick={() => onOpenTab(item.tab)}>
            <span className={`codicon codicon-${item.icon}`} aria-hidden />
            <span className="maint-overview-nav-copy">
              <strong>{t(item.titleKey)}</strong>
              <span className="hp-muted">{t(item.descKey)}</span>
            </span>
            <span className="codicon codicon-chevron-right maint-overview-nav-chevron" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

export function DiagnosticResultRow({
  check,
  onRerun,
  rerunning,
}: {
  check: DiagnosticCheck
  onRerun: () => void
  rerunning: boolean
}): ReactElement {
  const { t } = useTranslation('maintenance')
  const human = humanizeMaintenanceDiagnostic(check, t)
  const severity = check.severity ?? (check.ok ? 'pass' : 'fail')
  const rowClass =
    severity === 'pass'
      ? 'maint-diag-row--pass'
      : severity === 'warn'
        ? 'maint-diag-row--warn'
        : 'maint-diag-row--fail'
  const pillState = severity === 'pass' ? 'success' : severity === 'warn' ? 'warning' : 'failed'

  return (
    <div className={`maint-diag-row ${rowClass}`}>
      <div className="maint-diag-main">
        <strong className="maint-diag-title">{check.label}</strong>
        <p className="maint-diag-summary">{human.summary}</p>
        <p className="maint-diag-hint">{human.hint}</p>
        <details className="maint-diag-tech">
          <summary>{t('diag.showTechnical')}</summary>
          <code>{human.technical}</code>
        </details>
      </div>
      <div className="maint-diag-actions">
        <StatusPill state={pillState} />
        {!check.ok && human.action ? (
          <Link to={human.action.href} className="hp-btn maint-diag-action-btn">
            {t(human.action.labelKey)}
          </Link>
        ) : null}
        {check.id === 'docker' && !check.ok ? (
          <button type="button" className="hp-btn" disabled={rerunning} onClick={onRerun}>
            {rerunning ? t('health.running') : t('diag.rerun')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function StatusPill({ state }: { state: string }): ReactElement {
  const { t } = useTranslation('maintenance')
  const color =
    state === 'running' || state === 'healthy' || state === 'active' || state === 'success'
      ? 'var(--green)'
      : state === 'warning'
        ? 'var(--orange)'
      : state === 'completed'
        ? 'var(--accent)'
        : state === 'degraded' || state === 'failed' || state === 'inactive'
          ? 'var(--orange)'
          : state === 'offline'
            ? 'var(--red)'
            : 'var(--text-muted)'
  return (
    <span
      className="maint-status-pill"
      style={{
        border: `1px solid ${color}66`,
        color,
        background: `${color}14`,
        boxShadow: `0 0 20px -8px ${color}`,
      }}
    >
      {({
        active: t('statusPill.active'),
        inactive: t('statusPill.inactive'),
        unknown: t('statusPill.unknown'),
        not_installed: t('statusPill.notInstalled'),
        warning: t('statusPill.warning'),
      }[state] ?? state).toUpperCase()}
    </span>
  )
}
