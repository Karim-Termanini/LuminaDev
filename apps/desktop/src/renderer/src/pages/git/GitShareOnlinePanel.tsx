import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { githubRepoWebUrl } from '../gitAssistantRemoteUrl'
import { assertGitVcsOk } from '../gitVcsContract'
import { GitAssistantSection } from './GitAssistantSection'

export type GitShareOnlinePanelProps = {
  repoPath: string
  branch: string
  githubConnected: boolean
  ahead: number | null
  busy: boolean
}

export function GitShareOnlinePanel({
  repoPath,
  branch,
  githubConnected,
  ahead,
  busy,
}: GitShareOnlinePanelProps): ReactElement | null {
  const { t } = useTranslation('git')
  const [repoUrl, setRepoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath.trim() || !githubConnected) {
      setRepoUrl(null)
      return
    }
    void (async () => {
      try {
        const res = await window.dh.gitVcsRemotes({ repoPath: repoPath.trim() })
        assertGitVcsOk(res)
        const origin = (res.remotes ?? []).find((r) => r.name === 'origin') ?? res.remotes?.[0]
        if (!origin?.fetchUrl) {
          setRepoUrl(null)
          return
        }
        setRepoUrl(githubRepoWebUrl(origin.fetchUrl))
      } catch {
        setRepoUrl(null)
      }
    })()
  }, [repoPath, githubConnected])

  if (!githubConnected) return null

  const branchUrl =
    repoUrl && branch.trim()
      ? `${repoUrl}/tree/${encodeURIComponent(branch.trim())}`
      : repoUrl

  const showPushed = ahead != null && ahead === 0 && !!repoUrl

  return (
    <GitAssistantSection
      id="git-share-online-heading"
      title={t('assistant.share.connectedTitle')}
      subtitle={t('assistant.share.connectedSubtitle')}
      icon="github"
    >
      {showPushed ? (
        <p className="hp-muted" style={{ margin: '0 0 12px' }}>
          {t('assistant.share.pushedHint')}
        </p>
      ) : null}
      {branchUrl ? (
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={busy}
          onClick={() => void window.dh.openExternal(branchUrl)}
        >
          <span className="codicon codicon-link-external" aria-hidden />
          {t('assistant.share.openGithub')}
        </button>
      ) : (
        <p className="hp-muted" style={{ margin: 0 }}>
          {t('assistant.share.noGithubRemote')}
        </p>
      )}
    </GitAssistantSection>
  )
}
