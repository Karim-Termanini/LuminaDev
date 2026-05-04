import type { ReactElement } from 'react'
import { useState, useEffect } from 'react'
import { GLASS } from '../layout/GLASS'

export type IntegrateMethod = 'merge' | 'rebase' | 'fast-forward'

export type GitVcsIntegrateWizardModalProps = {
  isOpen: boolean
  repoPath: string
  currentBranch: string
  suggestedTarget?: string
  onClose: () => void
  onAction: (method: IntegrateMethod, target: string) => Promise<void>
  busy: boolean
}

export function GitVcsIntegrateWizardModal({
  isOpen,
  currentBranch,
  suggestedTarget,
  onClose,
  onAction,
  busy,
}: GitVcsIntegrateWizardModalProps): ReactElement | null {
  const [target, setTarget] = useState(suggestedTarget ?? '')
  const [method, setMethod] = useState<IntegrateMethod>('merge')

  // Sync state when suggestedTarget changes
  useEffect(() => {
    if (suggestedTarget) setTarget(suggestedTarget)
  }, [suggestedTarget])

  const [localLoading, setLocalLoading] = useState(false)

  if (!isOpen) return null

  const handleRun = async () => {
    if (!target.trim()) return
    setLocalLoading(true)
    console.log('[IntegrateWizard] handleRun triggered', { method, target })
    try {
      await onAction(method, target.trim())
    } catch (e) {
      console.error('[IntegrateWizard] Action failed:', e)
    } finally {
      setLocalLoading(false)
    }
  }

  const isWorking = busy || localLoading

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100, // Higher than conflict wizard
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          ...GLASS,
          borderRadius: 16,
          width: 500,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          animation: 'hp-modal-pop 0.25s cubic-bezier(0.2, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Integrate Changes</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Bringing updates from another branch into <span className="mono" style={{ color: 'var(--accent)' }}>{currentBranch}</span>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Target Selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Branch or remote ref to merge/rebase from
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Enter the ref you want to fold <em>into</em> <span className="mono">{currentBranch || 'this branch'}</span>{' '}
              (examples: <span className="mono">main</span>, <span className="mono">origin/main</span>,{' '}
              <span className="mono">origin/develop</span>). If you only need to upload commits or open a PR, close
              this dialog and use <strong>Push</strong> or <strong>New PR</strong> in the toolbar instead.
            </p>
            <input
              className="hp-input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="main or origin/main"
              autoFocus
              disabled={busy}
              style={{ width: '100%', fontSize: 14 }}
            />
          </div>

          {/* Method Selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Strategy
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div 
                onClick={() => !busy && setMethod('merge')}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${method === 'merge' ? 'var(--accent)' : 'var(--border)'}`,
                  background: method === 'merge' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>Merge</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Combine histories. Creates a merge commit.</div>
              </div>
              <div 
                onClick={() => !busy && setMethod('rebase')}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${method === 'rebase' ? 'var(--accent)' : 'var(--border)'}`,
                  background: method === 'rebase' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>Rebase</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Replay your work on top of the target history.</div>
              </div>
            </div>
          </div>

          {/* Quick Note */}
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 600 }}>Tip:</span> LuminaDev will automatically open the Resolution Studio if conflicts occur during the process.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="hp-btn" onClick={onClose} disabled={isWorking}>Cancel</button>
          <button 
            className="hp-btn hp-btn-primary" 
            onClick={handleRun} 
            disabled={isWorking || !target.trim()}
            style={{ minWidth: 100 }}
          >
            {isWorking ? (
              <>
                <span className="codicon codicon-loading spin" style={{ marginRight: 6 }} />
                Working...
              </>
            ) : method === 'merge' ? 'Start Merge' : 'Start Rebase'}
          </button>
        </div>
      </div>
    </div>
  )
}
