import type { CSSProperties, ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { GIT_VCS_NEXT_ACTION_RING } from './gitVcsUiTokens'

export type GitVcsOperation = 'none' | 'merging' | 'rebasing'

export function GitVcsStateBanner({
  operation,
  conflictFileCount,
  onOpenResolutionStudio,
  onContinueOperation,
  onAbortOperation,
  emphasizeNext,
}: {
  operation: GitVcsOperation
  conflictFileCount: number
  onOpenResolutionStudio: () => void
  onContinueOperation: () => void
  onAbortOperation: () => void
  /** Matches workflow hint “next” control — adds green focus ring. */
  emphasizeNext?: 'resolution_studio' | 'continue_merge' | null
}): ReactElement | null {
  const { t } = useTranslation('git')

  if (operation === 'none' && conflictFileCount === 0) {
    return null
  }


  let title = ''
  let body = ''
  if (operation === 'merging') {
    title = t('stateBanner.mergeInProgress')
    body = conflictFileCount > 0
      ? t('stateBanner.mergeConflicts', { count: conflictFileCount })
      : t('stateBanner.mergeAllResolved')
  } else if (operation === 'rebasing') {
    title = t('stateBanner.rebaseInProgress')
    body = conflictFileCount > 0
      ? t('stateBanner.rebaseConflicts', { count: conflictFileCount })
      : t('stateBanner.rebaseNoConflicts')
  } else {
    title = t('stateBanner.unmergedPaths')
    body = t('stateBanner.unmergedBody', { count: conflictFileCount })
  }

  const resStyle = (kind: 'resolution_studio' | 'continue_merge', base: CSSProperties): CSSProperties =>
    emphasizeNext === kind ? { ...base, ...GIT_VCS_NEXT_ACTION_RING } : base

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid rgba(255, 183, 77, 0.45)',
        background: 'linear-gradient(90deg, rgba(255, 183, 77, 0.12) 0%, rgba(255, 138, 128, 0.06) 100%)',
        color: 'var(--text)',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, flex: 1 }}>{body}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {conflictFileCount > 0 ? (
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={onOpenResolutionStudio}
              style={resStyle('resolution_studio', { padding: '4px 12px', fontSize: 12 })}
            >
              <span className="codicon codicon-tools" style={{ marginRight: 6 }} />
              {t('stateBanner.openResolutionStudio')}
            </button>
          ) : operation !== 'none' ? (
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={onContinueOperation}
              style={resStyle('continue_merge', {
                padding: '4px 12px',
                fontSize: 12,
                background: 'var(--success)',
                border: 'none',
              })}
            >
              <span className="codicon codicon-check" style={{ marginRight: 6 }} />
              {t('stateBanner.conclude', { op: operation === 'merging' ? t('stateBanner.merge') : t('stateBanner.rebase') })}
            </button>
          ) : null}
          {operation !== 'none' && (
            <button
              type="button"
              className="hp-btn"
              onClick={onAbortOperation}
              style={{ padding: '4px 12px', fontSize: 12, opacity: 0.8 }}
            >
              {t('stateBanner.abort')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
