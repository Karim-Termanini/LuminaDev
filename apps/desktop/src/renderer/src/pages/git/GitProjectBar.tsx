import type { GitRepoEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatRecentOpened,
  recentRepoBasename,
  recentRepoParentHint,
} from '../gitAssistantRecents'
import { GitAssistantSection } from './GitAssistantSection'

export type GitProjectBarProps = {
  repoPath: string
  branch: string
  recents: GitRepoEntry[]
  busy: boolean
  onSelectRepo: (path: string) => void
  onOpenFolder: () => void
  onClone: (url: string, targetDir: string) => Promise<void>
}

export function GitProjectBar({
  repoPath,
  branch,
  recents,
  busy,
  onSelectRepo,
  onOpenFolder,
  onClone,
}: GitProjectBarProps): ReactElement {
  const { t } = useTranslation('git')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const sorted = [...recents].sort((a, b) => b.lastOpened - a.lastOpened)

  return (
    <GitAssistantSection
      id="git-project-heading"
      title={t('assistant.project.title')}
      subtitle={t('assistant.project.subtitle')}
      icon="folder"
    >
      <div className="hp-row-wrap">
        <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onOpenFolder()}>
          <span className="codicon codicon-folder-opened" aria-hidden />
          {t('assistant.project.open')}
        </button>
        <button type="button" className="hp-btn" disabled={busy} onClick={() => setCloneOpen((v) => !v)}>
          <span className="codicon codicon-cloud-download" aria-hidden />
          {t('assistant.project.clone')}
        </button>
      </div>

      {sorted.length > 0 ? (
        <div className="git-assistant-recents">
          <div className="git-assistant-recents-label">{t('assistant.project.recents')}</div>
          <ul className="git-assistant-recents-list">
            {sorted.slice(0, 6).map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  className={`git-assistant-recent-row ${repoPath === r.path ? 'is-active' : ''}`.trim()}
                  disabled={busy}
                  onClick={() => onSelectRepo(r.path)}
                  title={r.path}
                >
                  <span className="git-assistant-recent-row-main">
                    <span className="git-assistant-recent-name">{recentRepoBasename(r.path)}</span>
                    <span className="git-assistant-recent-meta mono">
                      {recentRepoParentHint(r.path)} · {formatRecentOpened(r.lastOpened)}
                    </span>
                  </span>
                  {repoPath === r.path ? (
                    <span className="codicon codicon-check git-assistant-recent-check" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cloneOpen ? (
        <div className="git-assistant-clone-panel">
          <p className="hp-muted" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5 }}>
            {t('assistant.clone.parentHint')}
          </p>
          <input
            type="text"
            className="hp-input"
            placeholder={t('clone.urlPlaceholder')}
            value={cloneUrl}
            disabled={busy}
            onChange={(e) => setCloneUrl(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={busy || !cloneUrl.trim()}
            onClick={() => {
              void (async () => {
                const dir = await window.dh.selectFolder()
                if (!dir) return
                await onClone(cloneUrl.trim(), dir)
                setCloneUrl('')
                setCloneOpen(false)
              })()
            }}
          >
            {t('assistant.project.cloneConfirm')}
          </button>
        </div>
      ) : null}

      {repoPath ? (
        <div className="git-assistant-repo-path mono">
          <div>{repoPath}</div>
          {branch ? <div style={{ marginTop: 6, opacity: 0.85 }}>{t('assistant.project.branch', { branch })}</div> : null}
        </div>
      ) : (
        <p className="hp-muted" style={{ margin: '12px 0 0' }}>
          {t('assistant.project.empty')}
        </p>
      )}
    </GitAssistantSection>
  )
}
