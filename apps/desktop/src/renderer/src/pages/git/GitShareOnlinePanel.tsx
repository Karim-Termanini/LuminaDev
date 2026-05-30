import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CloudGitProviderId } from '../cloudGitTheme'
import { branchWebUrl, hostRepoWebLink, type HostRepoLink } from '../gitAssistantRemoteUrl'
import { cloudProviderLabel } from '../gitAssistantCloud'
import { assertGitVcsOk } from '../gitVcsContract'
import { GitAssistantSection } from './GitAssistantSection'
import { GitPullRequestPanel } from './GitPullRequestPanel'

export type GitShareOnlinePanelProps = {
  repoPath: string
  branch: string
  branchNames: string[]
  cloudProvider: CloudGitProviderId | null
  cloudConnected: boolean
  ahead: number | null
  behind: number | null
  busy: boolean
  suggestedPrTitle?: string
}

export function GitShareOnlinePanel({
  repoPath,
  branch,
  branchNames,
  cloudProvider,
  cloudConnected,
  ahead,
  behind,
  busy,
  suggestedPrTitle = '',
}: GitShareOnlinePanelProps): ReactElement | null {
  const { t } = useTranslation('git')
  const [hostLink, setHostLink] = useState<HostRepoLink | null>(null)
  const loadEpochRef = useRef(0)

  useEffect(() => {
    const epoch = ++loadEpochRef.current
    if (!repoPath.trim()) {
      setHostLink(null)
      return
    }
    void (async () => {
      try {
        const res = await window.dh.gitVcsRemotes({ repoPath: repoPath.trim() })
        if (epoch !== loadEpochRef.current) return
        assertGitVcsOk(res)
        const origin = (res.remotes ?? []).find((r) => r.name === 'origin') ?? res.remotes?.[0]
        if (!origin?.fetchUrl) {
          setHostLink(null)
          return
        }
        setHostLink(hostRepoWebLink(origin.fetchUrl))
      } catch {
        if (epoch === loadEpochRef.current) setHostLink(null)
      }
    })()
    return () => {
      loadEpochRef.current++
    }
  }, [repoPath])

  const branchNamesStable = useMemo(
    () => branchNames.filter((n) => n.trim().length > 0),
    [branchNames],
  )

  if (!cloudConnected) return null

  const branchUrl =
    hostLink && branch.trim() ? branchWebUrl(hostLink, branch.trim()) : hostLink?.repoUrl ?? null

  const showPushed = ahead != null && ahead === 0 && !!hostLink
  const hostName = hostLink ? cloudProviderLabel(hostLink.provider) : ''

  return (
    <GitAssistantSection
      id="git-share-online-heading"
      title={t('assistant.share.connectedTitle')}
      subtitle={t('assistant.share.connectedSubtitle', { host: hostName || 'GitHub' })}
      icon={hostLink?.provider === 'gitlab' ? 'source-control' : 'github'}
    >
      <GitPullRequestPanel
        repoPath={repoPath}
        branch={branch}
        branchNames={branchNamesStable}
        hostLink={hostLink}
        cloudProvider={cloudProvider}
        cloudConnected={cloudConnected}
        ahead={ahead}
        behind={behind}
        busy={busy}
        suggestedTitle={suggestedPrTitle}
      />

      {showPushed ? (
        <p className="hp-muted" style={{ margin: '12px 0 0', fontSize: 12 }}>
          {t('assistant.share.pushedHint', { host: hostName || 'GitHub' })}
        </p>
      ) : null}
      {branchUrl ? (
        <button
          type="button"
          className="hp-btn"
          disabled={busy}
          style={{ marginTop: 12 }}
          onClick={() => void window.dh.openExternal(branchUrl)}
        >
          <span className="codicon codicon-link-external" aria-hidden />
          {t('assistant.share.openHost', { host: hostName })}
        </button>
      ) : null}
    </GitAssistantSection>
  )
}
