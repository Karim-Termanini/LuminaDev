import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { humanizeCloudAuthError } from '../cloudAuthError'
import { cloudProviderLabel } from '../gitAssistantCloud'
import { guessDefaultBaseBranch } from '../gitAssistantDefaultBranch'
import {
  hostNewPullRequestUrl,
  isDefaultIntegrationBranch,
} from '../gitAssistantPullRequestUrl'
import type { HostRepoLink } from '../gitAssistantRemoteUrl'

export type GitPullRequestPanelProps = {
  repoPath: string
  branch: string
  branchNames: string[]
  hostLink: HostRepoLink | null
  cloudConnected: boolean
  ahead: number | null
  behind: number | null
  busy: boolean
  suggestedTitle: string
}

export function GitPullRequestPanel({
  repoPath,
  branch,
  branchNames,
  hostLink,
  cloudConnected,
  ahead,
  behind,
  busy,
  suggestedTitle,
}: GitPullRequestPanelProps): ReactElement {
  const { t } = useTranslation('git')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [prBusy, setPrBusy] = useState(false)
  const [prError, setPrError] = useState<string | null>(null)

  const head = branch.trim()
  const base = useMemo(() => guessDefaultBaseBranch(branchNames), [branchNames])
  const host = hostLink ? cloudProviderLabel(hostLink.provider) : 'GitHub'
  const compareUrl = hostLink ? hostNewPullRequestUrl(hostLink, head, base) : null
  const onIntegrationBranch = isDefaultIntegrationBranch(head)

  useEffect(() => {
    setTitle(suggestedTitle.trim() || head)
    setBody('')
    setPrError(null)
  }, [suggestedTitle, head, repoPath])

  if (!head) {
    return (
      <div className="git-assistant-pr-panel">
        <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
          {t('assistant.pr.noBranch')}
        </p>
      </div>
    )
  }

  if (onIntegrationBranch) {
    return (
      <div className="git-assistant-pr-panel">
        <div className="git-assistant-pr-panel-head">
          <span className="codicon codicon-git-pull-request" aria-hidden />
          <div>
            <div className="git-assistant-pr-panel-title">{t('assistant.pr.title')}</div>
            <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
              {t('assistant.pr.onDefaultBranch', { branch: head, base })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!hostLink || !compareUrl) {
    return (
      <div className="git-assistant-pr-panel">
        <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>
          {t('assistant.share.noRemote')}
        </p>
      </div>
    )
  }

  const unpushed = ahead != null && ahead > 0
  const behindBase = behind != null && behind > 0
  const canCreate = cloudConnected && !unpushed && !busy && !prBusy

  const openCompare = (): void => {
    void window.dh.openExternal(compareUrl)
  }

  const createPullRequest = async (): Promise<void> => {
    if (!canCreate) return
    const prTitle = title.trim()
    if (!prTitle) {
      setPrError(t('assistant.pr.titleRequired'))
      return
    }
    setPrBusy(true)
    setPrError(null)
    try {
      const res = await window.dh.cloudGitCreatePr({
        provider: hostLink.provider,
        repoPath: repoPath.trim(),
        remote: 'origin',
        title: prTitle,
        body: body.trim(),
        head,
        base,
      })
      if (res.ok && res.url?.trim()) {
        void window.dh.openExternal(res.url.trim())
        return
      }
      const raw = res.error ?? t('assistant.pr.createFailed')
      if (raw.includes('[CLOUD_GIT_PR_EXISTS]')) openCompare()
      setPrError(humanizeCloudAuthError(new Error(raw)))
    } catch (e) {
      setPrError(humanizeCloudAuthError(e))
    } finally {
      setPrBusy(false)
    }
  }

  return (
    <div className="git-assistant-pr-panel">
      <div className="git-assistant-pr-panel-head">
        <span className="codicon codicon-git-pull-request" aria-hidden />
        <div>
          <div className="git-assistant-pr-panel-title">{t('assistant.pr.title')}</div>
          <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            {t('assistant.pr.subtitle', { base, head, host })}
          </p>
        </div>
      </div>

      {unpushed ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {t('assistant.pr.pushFirst')}
        </p>
      ) : null}

      {behindBase ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {t('assistant.pr.behindBase', { count: behind, base })}
        </p>
      ) : null}

      {!cloudConnected ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {t('assistant.pr.connectCloud')}
        </p>
      ) : null}

      <label className="git-assistant-pr-field">
        <span>{t('assistant.pr.titleLabel')}</span>
        <input
          className="hp-input"
          value={title}
          disabled={busy || prBusy}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('assistant.pr.titlePlaceholder')}
        />
      </label>
      <label className="git-assistant-pr-field">
        <span>{t('assistant.pr.bodyLabel')}</span>
        <textarea
          className="hp-input"
          rows={3}
          value={body}
          disabled={busy || prBusy}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('assistant.pr.bodyPlaceholder')}
        />
      </label>

      {prError ? (
        <p className="hp-status-alert error" role="alert" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {prError}
        </p>
      ) : null}

      <div className="hp-row-wrap" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={!canCreate}
          onClick={() => void createPullRequest()}
        >
          <span className="codicon codicon-git-pull-request" aria-hidden />
          {t('assistant.pr.create', { host })}
        </button>
        <button type="button" className="hp-btn" disabled={busy || prBusy} onClick={openCompare}>
          <span className="codicon codicon-link-external" aria-hidden />
          {t('assistant.pr.openCompare', { host })}
        </button>
      </div>
    </div>
  )
}
