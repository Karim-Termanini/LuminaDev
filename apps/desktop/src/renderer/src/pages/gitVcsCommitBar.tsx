import type { CSSProperties, ReactElement } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { GIT_VCS_NEXT_ACTION_RING } from './gitVcsUiTokens'

export type GitVcsCommitBarProps = {
  message: string
  onMessageChange: (v: string) => void
  /** Receives the live textarea value at click time (avoids stale React state during async commit). */
  onCommit: (liveMessage: string) => void
  busy: boolean
  disabled: boolean
  /** Highlights message field or Commit to match workflow hints. */
  emphasizeCommit?: 'commit' | 'commit_message' | null
  /** Show AI suggest button (gated on enable_ai_commit_suggestions beta flag). */
  showAiSuggest?: boolean
}

const BASE_TEXTAREA: CSSProperties = {
  flex: '1 1 320px',
  minWidth: 200,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  color: 'var(--text)',
  resize: 'vertical',
  fontFamily: 'inherit',
}

export function GitVcsCommitBar({
  message,
  onMessageChange,
  onCommit,
  busy,
  disabled,
  emphasizeCommit = null,
  showAiSuggest = false,
}: GitVcsCommitBarProps): ReactElement {
  const { t } = useTranslation('git')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const taStyle =
    emphasizeCommit === 'commit_message' ? { ...BASE_TEXTAREA, ...GIT_VCS_NEXT_ACTION_RING } : BASE_TEXTAREA
  const commitBtnStyle = emphasizeCommit === 'commit' ? GIT_VCS_NEXT_ACTION_RING : undefined

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('commit.label')}
        </label>
        {showAiSuggest && (
          <button
            type="button"
            className="hp-btn"
            disabled={busy || disabled}
            title={t('commit.aiTitle')}
            onClick={() => {
              if (!message.trim()) {
                onMessageChange('feat: describe your changes here')
              }
            }}
            style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span className="codicon codicon-sparkle" style={{ fontSize: 11 }} />
            {t('commit.aiSuggest')}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <textarea
          ref={taRef}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          disabled={busy || disabled}
          rows={2}
          placeholder={t('commit.placeholder')}
          style={taStyle}
        />
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={busy || disabled || !message.trim()}
          onClick={() => void onCommit(taRef.current?.value ?? message)}
          style={commitBtnStyle}
        >
          {t('commit.button')}
        </button>
      </div>
    </div>
  )
}
