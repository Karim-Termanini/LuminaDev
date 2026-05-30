import type { FileEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { GitDualLabel } from './gitDualLabel'
import { GitAssistantSection } from './GitAssistantSection'

export type GitChangesPanelProps = {
  staged: FileEntry[]
  unstaged: FileEntry[]
  included: Set<string>
  onToggle: (path: string, included: boolean) => void
  onToggleAll: (paths: string[], included: boolean) => void
  busy: boolean
}

type Row = { path: string; status: FileEntry['status']; staged: boolean }

export function GitChangesPanel({
  staged,
  unstaged,
  included,
  onToggle,
  onToggleAll,
  busy,
}: GitChangesPanelProps): ReactElement {
  const { t } = useTranslation('git')

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

  return (
    <GitAssistantSection
      id="git-changes-heading"
      title={t('assistant.changes.title', { count: rows.length })}
      subtitle={
        <GitDualLabel primary={t('assistant.changes.stagePrimary')} sub={t('assistant.changes.stageSub')} />
      }
      icon="diff"
    >
      <div className="hp-row" style={{ justifyContent: 'flex-end', marginBottom: rows.length > 0 ? 10 : 0 }}>
        {rows.length > 0 ? (
          <button
            type="button"
            className="hp-btn"
            disabled={busy}
            style={{ fontSize: 11 }}
            onClick={() => onToggleAll(allPaths, !allIncluded)}
          >
            {allIncluded ? t('assistant.changes.deselectAll') : t('assistant.changes.selectAll')}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="hp-muted" style={{ margin: 0 }}>
          {t('assistant.changes.clean')}
        </p>
      ) : (
        <ul className="git-assistant-file-list">
          {rows.map((row) => (
            <li key={row.path} className="git-assistant-file-row">
              <input
                type="checkbox"
                checked={included.has(row.path)}
                disabled={busy}
                onChange={(e) => onToggle(row.path, e.target.checked)}
                aria-label={t('assistant.changes.stageAria', { file: row.path })}
              />
              <span className="git-assistant-file-path mono">{row.path}</span>
            </li>
          ))}
        </ul>
      )}
    </GitAssistantSection>
  )
}
