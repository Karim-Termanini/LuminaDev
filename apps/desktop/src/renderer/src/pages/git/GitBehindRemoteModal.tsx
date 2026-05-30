import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export type GitBehindRemoteModalProps = {
  open: boolean
  behind: number
  busy: boolean
  onPull: () => void
  onDismiss: () => void
}

export function GitBehindRemoteModal({
  open,
  behind,
  busy,
  onPull,
  onDismiss,
}: GitBehindRemoteModalProps): ReactElement | null {
  const { t } = useTranslation('git')

  if (!open) return null

  return (
    <div className="git-assistant-modal-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="git-assistant-modal"
        role="dialog"
        aria-labelledby="git-behind-remote-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="git-behind-remote-title" className="git-assistant-modal-title">
          {t('assistant.behind.title')}
        </h3>
        <p className="hp-muted" style={{ margin: '0 0 16px', lineHeight: 1.55 }}>
          {t('assistant.behind.body', { count: behind })}
        </p>
        <div className="hp-row-wrap">
          <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onPull()}>
            <span className="codicon codicon-repo-pull" aria-hidden />
            {t('assistant.behind.pull')}
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={onDismiss}>
            {t('assistant.behind.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
