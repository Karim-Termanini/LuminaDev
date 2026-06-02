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

function buildChangeRows(staged: FileEntry[], unstaged: FileEntry[]): {
  ready: Row[]
  working: Row[]
} {
  const ready: Row[] = []
  const working: Row[] = []
  for (const f of staged.filter((x) => x.status !== 'C')) {
    ready.push({ path: f.path, status: f.status, staged: true })
  }
  for (const f of unstaged.filter((x) => x.status !== 'C')) {
    working.push({
      path: f.path,
      status: f.status,
      staged: false,
    })
  }
  return { ready, working }
}

function FileRows({
  rows,
  included,
  busy,
  previewPath,
  diffLoading,
  diffText,
  diffBinary,
  onToggle,
  onTogglePreview,
  t,
}: {
  rows: Row[]
  included: Set<string>
  busy: boolean
  previewPath: string | null
  diffLoading: boolean
  diffText: string | null
  diffBinary: boolean
  onToggle: (path: string, included: boolean) => void
  onTogglePreview: (previewKey: string) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}): ReactElement {
  return (
    <ul className="git-assistant-file-list">
      {rows.map((row) => {
        const expanded = previewPath === `${row.staged ? 's' : 'u'}:${row.path}`
        const previewKey = `${row.staged ? 's' : 'u'}:${row.path}`
        return (
          <li
            key={previewKey}
            className={`git-assistant-file-row ${expanded ? 'is-expanded' : ''} ${
              row.staged ? 'is-staged' : 'is-unstaged'
            }`.trim()}
          >
            <div className="git-assistant-file-row-main">
              <button
                type="button"
                className="git-assistant-file-preview-toggle"
                disabled={busy}
                aria-expanded={expanded}
                aria-label={t('assistant.changes.previewAria', { file: row.path })}
                onClick={() => onTogglePreview(previewKey)}
              >
                <span
                  className={`codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
                  aria-hidden
                />
              </button>
              <span
                className={`git-assistant-file-badge ${row.staged ? 'is-ready' : 'is-working'}`}
              >
                {row.staged
                  ? t('assistant.changes.badgeReady')
                  : t('assistant.changes.badgeWorking')}
              </span>
              <span className="git-assistant-file-path mono" title={row.path}>
                {row.path}
              </span>
              <label className="git-assistant-file-stage">
                <input
                  type="checkbox"
                  checked={included.has(row.path)}
                  disabled={busy}
                  onChange={(e) => onToggle(row.path, e.target.checked)}
                  aria-label={t('assistant.changes.includeAria', { file: row.path })}
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
                ) : row.status === '?' ? (
                  <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
                    {t('assistant.changes.previewUntracked')}
                  </p>
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
  )
}

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
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [diffText, setDiffText] = useState<string | null>(null)
  const [diffBinary, setDiffBinary] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const diffEpochRef = useRef(0)

  const { ready, working } = useMemo(
    () => buildChangeRows(staged, unstaged),
    [staged, unstaged],
  )
  const allRows = useMemo(() => [...ready, ...working], [ready, working])
  const allPaths = allRows.map((r) => r.path)
  const allIncluded = allRows.length > 0 && allRows.every((r) => included.has(r.path))

  const previewRow = previewKey
    ? allRows.find((r) => `${r.staged ? 's' : 'u'}:${r.path}` === previewKey)
    : null

  const togglePreview = (key: string): void => {
    setPreviewKey((prev) => (prev === key ? null : key))
  }

  useEffect(() => {
    setPreviewKey(null)
    setDiffText(null)
    diffEpochRef.current++
  }, [repoPath])

  useEffect(() => {
    const path = repoPath.trim()
    if (!path || !previewRow) {
      setDiffText(null)
      setDiffBinary(false)
      setDiffLoading(false)
      return
    }
    const epoch = ++diffEpochRef.current
    setDiffLoading(true)
    setDiffText(null)
    void (async () => {
      try {
        const res = await window.dh.gitVcsDiff({
          repoPath: path,
          filePath: previewRow.path,
          staged: previewRow.staged,
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
  }, [previewKey, previewRow, repoPath])

  return (
    <GitAssistantSection
      id="git-changes-heading"
      title={t('assistant.changes.title', { count: allRows.length })}
      subtitle={
        <GitDualLabel
          primary={t('assistant.changes.stagePrimary')}
          sub={t('assistant.changes.stageSub')}
        />
      }
      icon="diff"
      className="git-assistant-changes-panel"
    >
      {allRows.length > 0 ? (
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

      {allRows.length === 0 ? (
        <p className="hp-muted" style={{ margin: 0 }}>
          {t('assistant.changes.clean')}
        </p>
      ) : (
        <>
          {ready.length > 0 ? (
            <div className="git-assistant-changes-group">
              <h4 className="git-assistant-changes-group-title">
                {t('assistant.changes.readyHeading', { count: ready.length })}
              </h4>
              <FileRows
                rows={ready}
                included={included}
                busy={busy}
                previewPath={previewKey}
                diffLoading={diffLoading}
                diffText={diffText}
                diffBinary={diffBinary}
                onToggle={onToggle}
                onTogglePreview={togglePreview}
                t={t}
              />
            </div>
          ) : null}
          {working.length > 0 ? (
            <div className="git-assistant-changes-group">
              <h4 className="git-assistant-changes-group-title">
                {t('assistant.changes.workingHeading', { count: working.length })}
              </h4>
              <FileRows
                rows={working}
                included={included}
                busy={busy}
                previewPath={previewKey}
                diffLoading={diffLoading}
                diffText={diffText}
                diffBinary={diffBinary}
                onToggle={onToggle}
                onTogglePreview={togglePreview}
                t={t}
              />
            </div>
          ) : null}
        </>
      )}
    </GitAssistantSection>
  )
}
