import type { JobSummary, MaintenanceStateStore } from '@linux-dev-home/shared'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { DiagnosticResultRow, StatusPill } from './MaintenanceUi'
import type { DiagnosticCheck } from './types'

export function MaintenanceLogsTab({
  t,
  jobs,
  state,
  diagnostics,
  runningDiagnostics,
  includeSensitiveBundle,
  setIncludeSensitiveBundle,
  onRunDiagnostics,
  onExportReport,
}: {
  t: TFunction<'maintenance'>
  jobs: JobSummary[]
  state: MaintenanceStateStore
  diagnostics: DiagnosticCheck[]
  runningDiagnostics: boolean
  includeSensitiveBundle: boolean
  setIncludeSensitiveBundle: (v: boolean) => void
  onRunDiagnostics: () => void
  onExportReport: () => void
}): ReactElement {
  return (
    <>
      <section className="maint-panel" id="maintenance-job-runner">
        <div className="hp-section-title">{t('section.jobRunner')}</div>
        <p className="hp-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
          {t('jobs.description')}
        </p>
        <div className="hp-table-wrap" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">{t('jobs.kind')}</th>
                <th className="hp-table-cell">{t('jobs.state')}</th>
                <th className="hp-table-cell">{t('jobs.progress')}</th>
                <th className="hp-table-cell">{t('jobs.tail')}</th>
                <th className="hp-table-cell">{t('jobs.action')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td className="hp-table-cell hp-muted" colSpan={5}>
                    {t('jobs.noJobs')}
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hp-table-row">
                    <td className="hp-table-cell mono">{j.kind}</td>
                    <td className="hp-table-cell">
                      <StatusPill state={j.state} />
                    </td>
                    <td className="hp-table-cell mono">{j.progress}%</td>
                    <td className="hp-table-cell mono" style={{ fontSize: 11 }}>
                      {j.logTail[j.logTail.length - 1] ?? '-'}
                    </td>
                    <td className="hp-table-cell">
                      {j.state === 'running' ? (
                        <button className="hp-btn" onClick={() => void window.dh.jobCancel({ id: j.id })}>
                          {t('jobs.cancel')}
                        </button>
                      ) : (
                        <span className="hp-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="maint-panel">
        <div className="maint-section-head">{t('section.maintenanceHistory')}</div>
        <div className="hp-table-wrap">
          <table className="hp-table">
            <thead>
              <tr className="hp-table-head">
                <th className="hp-table-cell">{t('history.at')}</th>
                <th className="hp-table-cell">{t('history.action')}</th>
                <th className="hp-table-cell">{t('history.result')}</th>
                <th className="hp-table-cell">{t('history.reclaimed')}</th>
                <th className="hp-table-cell">{t('history.note')}</th>
              </tr>
            </thead>
            <tbody>
              {(state.history ?? []).length === 0 ? (
                <tr>
                  <td className="hp-table-cell hp-muted" colSpan={5}>
                    {t('history.noHistory')}
                  </td>
                </tr>
              ) : (
                (state.history ?? []).map((h) => (
                  <tr key={h.id} className="hp-table-row">
                    <td className="hp-table-cell mono">{h.atIso}</td>
                    <td className="hp-table-cell mono">{h.action}</td>
                    <td className="hp-table-cell">
                      <StatusPill state={h.result} />
                    </td>
                    <td className="hp-table-cell">{h.reclaimedMb ? `~${h.reclaimedMb} MB` : '-'}</td>
                    <td className="hp-table-cell">{h.note ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="maint-panel">
        <div className="maint-section-head">{t('section.integrityDiagnostics')}</div>
        <p className="maint-section-lead">{t('health.diagnosticsLead')}</p>
        <div className="maint-toolbar maint-diag-toolbar">
          <div className="maint-diag-toolbar-primary">
            <button className="hp-btn hp-btn-primary" onClick={() => void onRunDiagnostics()} disabled={runningDiagnostics}>
              <span className="codicon codicon-run-all" aria-hidden />
              {runningDiagnostics ? t('health.running') : t('health.run')}
            </button>
            <p className="maint-toolbar-hint">{t('health.runDesc')}</p>
          </div>
          <div className="maint-diag-toolbar-secondary">
            <button type="button" className="hp-btn" onClick={() => void onExportReport()}>
              <span className="codicon codicon-export" aria-hidden />
              {t('health.export')}
            </button>
            <p className="maint-toolbar-hint">{t('health.exportDesc')}</p>
          </div>
          <label className="maint-sensitive-toggle">
            <input
              type="checkbox"
              checked={includeSensitiveBundle}
              onChange={(e) => setIncludeSensitiveBundle(e.target.checked)}
            />
            <span>
              <strong>{t('health.includeSensitive')}</strong>
              <span className="hp-muted"> — {t('health.includeSensitiveDesc')}</span>
            </span>
          </label>
        </div>
        <div className="maint-diag-list">
          {diagnostics.length === 0 ? (
            <div className="hp-muted maint-diag-empty">{t('health.noDiagnostics')}</div>
          ) : (
            diagnostics.map((d) => (
              <DiagnosticResultRow
                key={d.id}
                check={d}
                rerunning={runningDiagnostics}
                onRerun={() => void onRunDiagnostics()}
              />
            ))
          )}
        </div>
      </section>
    </>
  )
}
