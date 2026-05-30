import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { GitAssistantNextAction } from '../gitAssistantNextAction'
import { GitDualLabel } from './gitDualLabel'

export type GitNextStepCardProps = {
  next: GitAssistantNextAction
  busy: boolean
  onPrimary: () => void
}

const ACTION_ICONS: Record<Exclude<GitAssistantNextAction, null>, string> = {
  connect_github: 'link',
  open_project: 'folder-opened',
  open_editor: 'edit',
  continue_merge: 'debug-continue',
  pull: 'repo-pull',
  commit: 'git-commit',
  commit_message: 'comment-discussion',
  push: 'repo-push',
}

export function GitNextStepCard({ next, busy, onPrimary }: GitNextStepCardProps): ReactElement {
  const { t } = useTranslation('git')

  if (!next) {
    return (
      <div className="git-assistant-spotlight is-idle" role="status">
        <div className="git-assistant-spotlight-body">
          <span className="git-assistant-spotlight-icon" aria-hidden>
            <span className="codicon codicon-check" />
          </span>
          <div>
            <div className="git-assistant-next-kicker">{t('assistant.next.kicker')}</div>
            <p className="git-assistant-next-hint">{t('assistant.next.allGood')}</p>
          </div>
        </div>
      </div>
    )
  }

  const primaryKey = `assistant.next.${next}.primary` as const
  const subKey = `assistant.next.${next}.sub` as const
  const hintKey = `assistant.next.${next}.hint` as const
  const icon = ACTION_ICONS[next]

  return (
    <div className="git-assistant-spotlight">
      <div className="git-assistant-spotlight-body">
        <span className="git-assistant-spotlight-icon" aria-hidden>
          <span className={`codicon codicon-${icon}`} />
        </span>
        <div>
          <div className="git-assistant-next-kicker">{t('assistant.next.kicker')}</div>
          <p className="git-assistant-next-hint">{t(hintKey)}</p>
        </div>
      </div>
      <button
        type="button"
        className="hp-btn hp-btn-primary git-assistant-cta-emphasis"
        disabled={busy}
        onClick={() => void onPrimary()}
      >
        <GitDualLabel primary={t(primaryKey)} sub={t(subKey)} inline />
      </button>
    </div>
  )
}
