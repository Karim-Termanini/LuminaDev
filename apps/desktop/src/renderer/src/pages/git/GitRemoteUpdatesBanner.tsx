import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export type GitRemoteUpdatesBannerProps = {
  behind: number
  busy: boolean
  onGetLatest: () => void
}

/** Shown when fetch detected commits on the remote the user does not have yet. */
export function GitRemoteUpdatesBanner({
  behind,
  busy,
  onGetLatest,
}: GitRemoteUpdatesBannerProps): ReactElement {
  const { t } = useTranslation('git')

  return (
    <div className="hp-status-alert warning git-assistant-remote-updates" role="status">
      <div className="git-assistant-remote-updates-head">
        <span className="codicon codicon-cloud-download" aria-hidden />
        <strong>{t('assistant.remoteUpdates.title')}</strong>
      </div>
      <p className="hp-muted" style={{ margin: '6px 0 10px', fontSize: 12, lineHeight: 1.5 }}>
        {t('assistant.remoteUpdates.body', { count: behind })}
      </p>
      <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={onGetLatest}>
        <span className="codicon codicon-repo-pull" aria-hidden />
        {t('assistant.remoteUpdates.pull')}
      </button>
    </div>
  )
}
