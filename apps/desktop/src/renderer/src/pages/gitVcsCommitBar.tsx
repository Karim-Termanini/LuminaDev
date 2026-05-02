import type { ReactElement } from 'react'

export type GitVcsCommitBarProps = {
  message: string
  onMessageChange: (v: string) => void
  onCommit: () => void
  busy: boolean
  disabled: boolean
}

export function GitVcsCommitBar({
  message,
  onMessageChange,
  onCommit,
  busy,
  disabled,
}: GitVcsCommitBarProps): ReactElement {
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
      <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Commit message
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          disabled={busy || disabled}
          rows={2}
          placeholder="Describe your changes…"
          style={{
            flex: '1 1 320px',
            minWidth: 200,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            color: 'var(--text)',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={busy || disabled || !message.trim()}
          onClick={() => void onCommit()}
        >
          Commit
        </button>
      </div>
    </div>
  )
}
