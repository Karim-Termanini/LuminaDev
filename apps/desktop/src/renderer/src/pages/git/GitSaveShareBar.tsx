import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { GitAssistantNextAction } from '../gitAssistantNextAction'
import { GIT_VCS_NEXT_ACTION_RING } from '../gitVcsUiTokens'
import { GitDualLabel } from './gitDualLabel'
import { GitAssistantSection } from './GitAssistantSection'

export type GitSaveShareBarProps = {
  message: string
  onMessageChange: (v: string) => void
  busy: boolean
  saveDisabled: boolean
  next: GitAssistantNextAction
  showPull: boolean
  showPush: boolean
  onSaveSnapshot: (liveMessage: string) => void
  onGetLatest: () => void
  onSend: () => void
}

export function GitSaveShareBar({
  message,
  onMessageChange,
  busy,
  saveDisabled,
  next,
  showPull,
  showPush,
  onSaveSnapshot,
  onGetLatest,
  onSend,
}: GitSaveShareBarProps): ReactElement {
  const { t } = useTranslation('git')

  const saveStyle = next === 'commit' || next === 'commit_message' ? GIT_VCS_NEXT_ACTION_RING : undefined
  const pullStyle = next === 'pull' ? GIT_VCS_NEXT_ACTION_RING : undefined
  const pushStyle = next === 'push' ? GIT_VCS_NEXT_ACTION_RING : undefined

  return (
    <GitAssistantSection
      id="git-save-heading"
      title={t('assistant.save.title')}
      subtitle={t('assistant.save.subtitle')}
      icon="save"
    >
      <div className="git-assistant-message-field">
        <label className="hp-muted" style={{ display: 'block', marginBottom: 8 }}>
          <GitDualLabel primary={t('assistant.save.messagePrimary')} sub={t('assistant.save.messageSub')} />
        </label>
        <textarea
          className="hp-input"
          value={message}
          disabled={busy || saveDisabled}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={t('assistant.save.messagePlaceholder')}
          rows={3}
          style={next === 'commit_message' ? GIT_VCS_NEXT_ACTION_RING : undefined}
        />
      </div>
      {busy ? (
        <p className="hp-muted git-assistant-sync-busy" role="status" style={{ margin: '0 0 10px', fontSize: 12 }}>
          <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden />
          {t('assistant.save.syncBusy')}
        </p>
      ) : null}
      <div className="git-assistant-actions">
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={busy || saveDisabled}
          style={saveStyle}
          onClick={() => onSaveSnapshot(message)}
        >
          <span className="codicon codicon-git-commit" aria-hidden />
          <GitDualLabel primary={t('assistant.save.commitPrimary')} sub={t('assistant.save.commitSub')} inline />
        </button>
        {showPull ? (
          <button type="button" className="hp-btn" disabled={busy} style={pullStyle} onClick={() => void onGetLatest()}>
            <span className="codicon codicon-repo-pull" aria-hidden />
            <GitDualLabel primary={t('assistant.save.pullPrimary')} sub={t('assistant.save.pullSub')} inline />
          </button>
        ) : null}
        {showPush ? (
          <button type="button" className="hp-btn" disabled={busy} style={pushStyle} onClick={() => void onSend()}>
            <span className="codicon codicon-repo-push" aria-hidden />
            <GitDualLabel primary={t('assistant.save.pushPrimary')} sub={t('assistant.save.pushSub')} inline />
          </button>
        ) : null}
      </div>
    </GitAssistantSection>
  )
}
