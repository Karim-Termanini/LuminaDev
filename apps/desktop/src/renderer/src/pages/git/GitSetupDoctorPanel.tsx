import type { DoctorFinding } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applyDoctorFixAction } from '../gitSetupDoctor'

export type GitSetupDoctorPanelProps = {
  busy: boolean
  onSetConfigKey: (key: string, value: string) => Promise<void>
  onReloadSetup: () => Promise<void>
}

export function GitSetupDoctorPanel({
  busy,
  onSetConfigKey,
  onReloadSetup,
}: GitSetupDoctorPanelProps): ReactElement {
  const { t } = useTranslation('git')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [score, setScore] = useState<number | null>(null)
  const [gitVersion, setGitVersion] = useState<string | null>(null)
  const [findings, setFindings] = useState<DoctorFinding[]>([])
  const scanEpochRef = useRef(0)

  useEffect(() => {
    return () => {
      scanEpochRef.current++
    }
  }, [])

  const issues = findings.filter((f) => f.severity !== 'ok')
  const critCount = issues.filter((f) => f.severity === 'critical').length
  const warnCount = issues.filter((f) => f.severity === 'warning').length

  const runScan = async (): Promise<void> => {
    const epoch = ++scanEpochRef.current
    setPhase('scanning')
    try {
      const res = await window.dh.gitDoctorScan()
      if (epoch !== scanEpochRef.current) return
      if (!res.ok || !Array.isArray(res.findings)) {
        setPhase('error')
        return
      }
      setFindings(res.findings as DoctorFinding[])
      setScore(typeof res.healthScore === 'number' ? res.healthScore : null)
      setGitVersion(typeof res.gitVersion === 'string' ? res.gitVersion : null)
      setPhase('done')
    } catch {
      if (epoch === scanEpochRef.current) setPhase('error')
    }
  }

  const applyFix = async (finding: DoctorFinding): Promise<void> => {
    const ok = await applyDoctorFixAction(finding.fix?.action, onSetConfigKey)
    if (ok) {
      await onReloadSetup()
      await runScan()
    }
  }

  const scoreColor =
    score == null ? 'var(--text-muted)' : score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)'

  return (
    <div className="git-assistant-doctor-panel">
      <div className="git-assistant-doctor-panel-head">
        <span className="codicon codicon-heart" aria-hidden />
        <div>
          <div className="git-assistant-doctor-panel-title">{t('config.doctor.title')}</div>
          <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            {t('config.doctor.scanDesc')}
          </p>
        </div>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={busy || phase === 'scanning'}
          onClick={() => void runScan()}
        >
          {phase === 'scanning' ? (
            <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden />
          ) : null}
          {phase === 'done' ? t('config.doctor.rescanBtn') : t('config.doctor.scanBtn')}
        </button>
      </div>

      {phase === 'error' ? (
        <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
          {t('assistant.setup.doctorError')}
        </p>
      ) : null}

      {phase === 'done' ? (
        <div className="git-assistant-doctor-results">
          <div className="git-assistant-doctor-score" style={{ color: scoreColor }}>
            {score ?? '—'}
            <span className="git-assistant-doctor-score-sub">/ 100</span>
          </div>
          <div className="git-assistant-doctor-meta">
            {gitVersion ? <span className="mono">git {gitVersion}</span> : null}
            {issues.length === 0 ? (
              <span>{t('config.doctor.noIssues')}</span>
            ) : (
              <span>
                {t('config.doctor.issues', { critical: critCount, warnings: warnCount })}
              </span>
            )}
          </div>
          {issues.length > 0 ? (
            <ul className="git-assistant-doctor-findings">
              {issues.map((f) => (
                <li key={f.id} className={`git-assistant-doctor-finding-row is-${f.severity}`}>
                  <div>
                    <div className="git-assistant-doctor-finding-title">{f.title}</div>
                    <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
                      {f.detail}
                    </p>
                  </div>
                  {f.fix?.label && f.fix.action ? (
                    <button
                      type="button"
                      className="hp-btn"
                      disabled={busy}
                      style={{ fontSize: 12, flexShrink: 0 }}
                      onClick={() => void applyFix(f)}
                    >
                      {f.fix.label}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
