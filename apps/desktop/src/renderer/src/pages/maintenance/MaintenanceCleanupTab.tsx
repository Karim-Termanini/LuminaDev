import type { TFunction } from 'i18next'
import type { Dispatch, ReactElement, SetStateAction } from 'react'
import { Link } from 'react-router-dom'

export function MaintenanceCleanupTab({
  t,
  recommendedSelection,
  setRecommendedSelection,
  onRunRecommended,
  busyCleanup,
  savingState,
}: {
  t: TFunction<'maintenance'>
  recommendedSelection: { clearCache: boolean; pruneDocker: boolean; cleanLogs: boolean }
  setRecommendedSelection: Dispatch<
    SetStateAction<{ clearCache: boolean; pruneDocker: boolean; cleanLogs: boolean }>
  >
  onRunRecommended: () => void
  busyCleanup: boolean
  savingState: boolean
}): ReactElement {
  return (
    <section className="maint-panel">
      <div className="maint-section-head">{t('section.runRecommended')}</div>
      <p className="maint-section-lead">{t('cleanup.lead')}</p>
      <div className="maint-actions-body">
        <label className="maint-check-row">
          <input
            type="checkbox"
            checked={recommendedSelection.clearCache}
            onChange={(e) => setRecommendedSelection((p) => ({ ...p, clearCache: e.target.checked }))}
          />{' '}
          {t('section.clearCache')}
        </label>
        <label className="maint-check-row">
          <input
            type="checkbox"
            checked={recommendedSelection.pruneDocker}
            onChange={(e) => setRecommendedSelection((p) => ({ ...p, pruneDocker: e.target.checked }))}
          />{' '}
          {t('section.pruneDocker')}
        </label>
        <label className="maint-check-row">
          <input
            type="checkbox"
            checked={recommendedSelection.cleanLogs}
            onChange={(e) => setRecommendedSelection((p) => ({ ...p, cleanLogs: e.target.checked }))}
          />{' '}
          {t('section.cleanLogs')}
        </label>
        <button
          className="hp-btn hp-btn-primary maint-actions-run"
          onClick={() => void onRunRecommended()}
          disabled={busyCleanup || savingState}
        >
          <span className="codicon codicon-play" aria-hidden />
          {t('section.runQuick')}
        </button>
      </div>
      <p className="maint-section-lead maint-docker-page-hint">
        {t('cleanup.dockerPageHint')}{' '}
        <Link to="/docker">{t('cleanup.openDocker')}</Link>
      </p>
    </section>
  )
}
