import type { FileEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { assertGitVcsOk } from '../gitVcsContract'
import { GitDualLabel } from './gitDualLabel'
import { GitAssistantSection } from './GitAssistantSection'

export type GitChangesPanelProps = {
  repoPath: string
  staged: FileEntry[]
  unstaged: FileEntry[]
  included: Set<string>
  onToggle: (path: string, included: boolean) => void
  onToggleAll: (paths: string[], included: boolean) => void
  busy: boolean
}

type Row = { path: string; status: FileEntry['status']; staged: boolean }

export function GitChangesPanel({
  repoPath,
  staged,
  unstaged,
  included,
  onToggle,
  onToggleAll,
  busy,
}: GitChangesPanelProps): ReactElement {
  const { t } = useTranslation('git')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [diffText, setDiffText] = useState<string | null>(null)
  const [diffBinary, setDiffBinary] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const diffEpochRef = useRef(0)

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const f of unstaged.filter((x) => x.status !== 'C')) {
      out.push({ path: f.path, status: f.status, staged: false })
    }
    for (const f of staged.filter((x) => x.status !== 'C')) {
      if (!out.some((r) => r.path === f.path)) out.push({ path: f.path, status: f.status, staged: true })
    }
    return out
  }, [staged, unstaged])

  const allPaths = rows.map((r) => r.path)
  const allIncluded = rows.length > 0 && rows.every((r) => included.has(r.path))

  useEffect(() => {
    setPreviewPath(null)
    setDiffText(null)
    diffEpochRef.current++
  }, [repoPath])

  useEffect(() => {
    const path = repoPath.trim()
    if (!path || !previewPath) {
      setDiffText(null)
      setDiffBinary(false)
      setDiffLoading(false)
      return
    }
    const row = rows.find((r) => r.path === previewPath)
    if (!row) return
    const epoch = ++diffEpochRef.current
    setDiffLoading(true)
    setDiffText(null)
    void (async () => {
      try {
        const res = await window.dh.gitVcsDiff({
          repoPath: path,
          filePath: previewPath,
          staged: row.staged,
        })
        if (epoch !== diffEpochRef.current) return
        assertGitVcsOk(res)
        setDiffBinary(!!res.binary)
        setDiffText(res.diff ?? '')
      } catch {
        if (epoch === diffEpochRef.current) {
          setDiffText(null)
          setDiffBinary(false)
        }
      } finally {
        if (epoch === diffEpochRef.current) setDiffLoading(false)
      }
    })()
    return () => {
      diffEpochRef.current++
    }
  }, [previewPath, repoPath, rows])

  const togglePreview = (filePath: string): void => {
    setPreviewPath((prev) => (prev === filePath ? null : filePath))
  }

  return (
    <GitAssistantSection
      id="git-changes-heading"
      title={t('assistant.changes.title', { count: rows.length })}
      subtitle={
        <GitDualLabel primary={t('assistant.changes.stagePrimary')} sub={t('assistant.changes.stageSub')} />
      }
      icon="diff"
      className="git-assistant-changes-panel"
    >
      {rows.length > 0 ? (
        <div className="git-assistant-changes-toolbar">
          <button
            type="button"
            className="hp-btn"
            disabled={busy}
            style={{ fontSize: 11 }}
            onClick={() => onToggleAll(allPaths, !allIncluded)}
          >
            {allIncluded ? t('assistant.changes.deselectAll') : t('assistant.changes.selectAll')}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="hp-muted" style={{ margin: 0 }}>
          {t('assistant.changes.clean')}
        </p>
      ) : (
        <ul className="git-assistant-file-list">
          {rows.map((row) => {
            const expanded = previewPath === row.path
            return (
              <li key={row.path} className={`git-assistant-file-row ${expanded ? 'is-expanded' : ''}`.trim()}>
                <div className="git-assistant-file-row-main">
                  <button
                    type="button"
                    className="git-assistant-file-preview-toggle"
                    disabled={busy}
                    aria-expanded={expanded}
                    aria-label={t('assistant.changes.previewAria', { file: row.path })}
                    onClick={() => togglePreview(row.path)}
                  >
                    <span
                      className={`codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
                      aria-hidden
                    />
                  </button>
                  <span className="git-assistant-file-path mono" title={row.path}>
                    {row.path}
                  </span>
                  <label className="git-assistant-file-stage">
                    <input
                      type="checkbox"
                      checked={included.has(row.path)}
                      disabled={busy}
                      onChange={(e) => onToggle(row.path, e.target.checked)}
                      aria-label={t('assistant.changes.stageAria', { file: row.path })}
                    />
                  </label>
                </div>
                {expanded ? (
                  <div className="git-assistant-diff-preview" aria-live="polite">
                    {diffLoading ? (
                      <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
                        {t('assistant.changes.previewLoading')}
                      </p>
                    ) : diffBinary ? (
                      <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
                        {t('assistant.changes.previewBinary')}
                      </p>
                    ) : diffText?.trim() ? (
                      <pre>{diffText}</pre>
                    ) : (
                      <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
                        {t('assistant.changes.previewEmpty')}
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </GitAssistantSection>
  )
}
