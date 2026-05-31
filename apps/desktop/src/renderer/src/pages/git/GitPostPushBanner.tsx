import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export type GitPostPushBannerProps = {
  host: string
  branchUrl: string
  busy: boolean
  onDismiss: () => void
}

export function GitPostPushBanner({
  host,
  branchUrl,
  busy,
  onDismiss,
}: GitPostPushBannerProps): ReactElement {
  const { t } = useTranslation('git')

  return (
    <div className="hp-status-alert success git-assistant-post-push" role="status">
      <span className="codicon codicon-cloud-upload" aria-hidden />
      <div className="git-assistant-post-push-body">
        <p style={{ margin: 0 }}>{t('assistant.push.success')}</p>
        <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {t('assistant.push.createPrHint', { host })}
        </p>
        <button
          type="button"
          className="hp-btn"
          disabled={busy}
          style={{ marginTop: 8 }}
          onClick={() => void window.dh.openExternal(branchUrl)}
        >
          <span className="codicon codicon-link-external" aria-hidden />
          {t('assistant.push.viewBranch', { host })}
        </button>
      </div>
      <button
        type="button"
        className="hp-btn git-assistant-post-push-dismiss"
        aria-label={t('assistant.push.dismiss')}
        onClick={onDismiss}
      >
        <span className="codicon codicon-close" aria-hidden />
      </button>
    </div>
  )
}
