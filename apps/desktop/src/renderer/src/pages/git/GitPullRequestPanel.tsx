import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CloudGitProviderId } from '../cloudGitTheme'
import { humanizeCloudAuthError } from '../cloudAuthError'
import { cloudProviderLabel } from '../gitAssistantCloud'
import { guessDefaultBaseBranch } from '../gitAssistantDefaultBranch'
import { branchNeedsPublishBeforePr } from '../gitAssistantPrPublish'
import {
  hostNewPullRequestUrl,
  isDefaultIntegrationBranch,
} from '../gitAssistantPullRequestUrl'
import { PR_BODY_DEFAULT_TEMPLATE } from '../gitAssistantPrBodyTemplate'
import type { HostRepoLink } from '../gitAssistantRemoteUrl'

export type GitPullRequestPanelProps = {
  repoPath: string
  branch: string
  branchNames: string[]
  hostLink: HostRepoLink | null
  /** Connected account for this remote (from preferredCloudProvider). */
  cloudProvider: CloudGitProviderId | null
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
  cloudProvider,
  cloudConnected,
  ahead,
  behind,
  busy,
  suggestedTitle,
}: GitPullRequestPanelProps): ReactElement {
  const { t } = useTranslation('git')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(PR_BODY_DEFAULT_TEMPLATE)
  const [prBusy, setPrBusy] = useState(false)
  const [prError, setPrError] = useState<string | null>(null)
  const [prSuccess, setPrSuccess] = useState<string | null>(null)
  const [lastPrUrl, setLastPrUrl] = useState<string | null>(null)
  const [existingPrUrl, setExistingPrUrl] = useState<string | null>(null)
  const [existingPrLoading, setExistingPrLoading] = useState(false)

  const head = branch.trim()
  const base = useMemo(() => guessDefaultBaseBranch(branchNames), [branchNames])
  const host = hostLink ? cloudProviderLabel(hostLink.provider) : 'GitHub'
  const compareUrl = hostLink ? hostNewPullRequestUrl(hostLink, head, base) : null
  const onIntegrationBranch = isDefaultIntegrationBranch(head)

  useEffect(() => {
    setTitle(suggestedTitle.trim() || head)
    setBody(PR_BODY_DEFAULT_TEMPLATE)
    setPrError(null)
    setPrSuccess(null)
    setLastPrUrl(null)
    setExistingPrUrl(null)
  }, [suggestedTitle, head, repoPath])

  const providerReady =
    cloudProvider != null && hostLink != null && hostLink.provider === cloudProvider
  const needsPublish = branchNeedsPublishBeforePr(ahead, behind)

  useEffect(() => {
    if (
      !cloudConnected ||
      !providerReady ||
      !cloudProvider ||
      !repoPath.trim() ||
      !head ||
      needsPublish
    ) {
      setExistingPrUrl(null)
      setExistingPrLoading(false)
      return
    }
    let cancelled = false
    setExistingPrLoading(true)
    void (async () => {
      try {
        const res = await window.dh.cloudGitFindPr({
          provider: cloudProvider,
          repoPath: repoPath.trim(),
          remote: 'origin',
          head,
        })
        if (cancelled) return
        if (res.ok && res.url?.trim()) {
          setExistingPrUrl(res.url.trim())
        } else {
          setExistingPrUrl(null)
        }
      } catch {
        if (!cancelled) setExistingPrUrl(null)
      } finally {
        if (!cancelled) setExistingPrLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloudConnected, providerReady, cloudProvider, repoPath, head, needsPublish])

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

  const behindBase = behind != null && behind > 0
  const prFormLocked = !!existingPrUrl
  const canCreate =
    cloudConnected &&
    providerReady &&
    !needsPublish &&
    !busy &&
    !prBusy &&
    !existingPrLoading &&
    !existingPrUrl

  const openExternalUrl = async (url: string): Promise<void> => {
    setLastPrUrl(url)
    setPrSuccess(null)
    setPrError(null)
    try {
      await window.dh.openExternal(url)
      setPrSuccess(t('assistant.pr.openedInBrowser', { host }))
    } catch (e) {
      setPrError(
        `${humanizeCloudAuthError(e)} ${t('assistant.pr.openLinkManually')}`,
      )
    }
  }

  const openCompare = (): void => {
    void openExternalUrl(compareUrl)
  }

  const createPullRequest = async (): Promise<void> => {
    setPrSuccess(null)
    if (!cloudConnected) {
      setPrError(t('assistant.pr.connectCloud'))
      return
    }
    if (!providerReady || !cloudProvider) {
      setPrError(
        t('assistant.pr.wrongProvider', {
          host,
          connected: cloudProvider ? cloudProviderLabel(cloudProvider) : '—',
        }),
      )
      return
    }
    if (needsPublish) {
      setPrError(
        ahead == null && behind == null
          ? t('assistant.pr.noUpstream')
          : t('assistant.pr.pushFirst'),
      )
      return
    }
    if (existingPrUrl) return
    if (busy || prBusy) return

    const prTitle = title.trim()
    if (!prTitle) {
      setPrError(t('assistant.pr.titleRequired'))
      return
    }
    setPrBusy(true)
    setPrError(null)
    try {
      const res = await window.dh.cloudGitCreatePr({
        provider: cloudProvider,
        repoPath: repoPath.trim(),
        remote: 'origin',
        title: prTitle,
        body: body.trim(),
        head,
        base,
      })
      if (res.ok && res.url?.trim()) {
        const url = res.url.trim()
        setExistingPrUrl(url)
        await openExternalUrl(url)
        return
      }
      const raw = res.error ?? t('assistant.pr.createFailed')
      const existingUrl = res.existingUrl?.trim()
      if (raw.includes('[CLOUD_GIT_PR_EXISTS]') && existingUrl) {
        setExistingPrUrl(existingUrl)
        await openExternalUrl(existingUrl)
        setPrError(null)
        return
      }
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

      {needsPublish ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {ahead == null && behind == null
            ? t('assistant.pr.noUpstream')
            : t('assistant.pr.pushFirst')}
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

      {cloudConnected && !providerReady ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {t('assistant.pr.wrongProvider', {
            host,
            connected: cloudProvider ? cloudProviderLabel(cloudProvider) : '—',
          })}
        </p>
      ) : null}

      {existingPrLoading ? (
        <p className="hp-muted git-assistant-pr-hint" role="status">
          {t('assistant.pr.checkingExisting')}
        </p>
      ) : null}

      {existingPrUrl ? (
        <p className="hp-status-alert success" role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {t('assistant.pr.alreadyExists', { host })}
        </p>
      ) : null}

      <label className="git-assistant-pr-field">
        <span>{t('assistant.pr.titleLabel')}</span>
        <input
          className="hp-input"
          value={title}
          disabled={busy || prBusy || prFormLocked}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('assistant.pr.titlePlaceholder')}
        />
      </label>
      <label className="git-assistant-pr-field">
        <span>{t('assistant.pr.bodyLabel')}</span>
        <textarea
          className="hp-input"
          rows={14}
          value={body}
          disabled={busy || prBusy || prFormLocked}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      {prError ? (
        <p className="hp-status-alert error" role="alert" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {prError}
        </p>
      ) : null}

      {prSuccess ? (
        <p className="hp-status-alert success" role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {prSuccess}
        </p>
      ) : null}

      {(lastPrUrl || existingPrUrl) ? (
        <button
          type="button"
          className="hp-btn"
          style={{ marginTop: 8, fontSize: 12 }}
          disabled={busy || prBusy}
          onClick={() => void openExternalUrl(existingPrUrl ?? lastPrUrl!)}
        >
          <span className="codicon codicon-link-external" aria-hidden />
          {existingPrUrl ? t('assistant.pr.openExisting') : t('assistant.pr.retryOpenLink')}
        </button>
      ) : null}

      <div className="hp-row-wrap" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={!canCreate}
          onClick={() => void createPullRequest()}
        >
          <span className="codicon codicon-git-pull-request" aria-hidden />
          {t('assistant.pr.create')}
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={busy || prBusy || needsPublish}
          onClick={openCompare}
        >
          <span className="codicon codicon-link-external" aria-hidden />
          {t('assistant.pr.openCompare', { host })}
        </button>
      </div>
    </div>
  )
}
