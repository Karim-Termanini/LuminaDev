import type { ReactElement } from 'react'
import { useState, useEffect } from 'react'
import { GitVcsConflictResolver } from './GitVcsConflictResolver'

export type GitVcsConflictWizardModalProps = {
  isOpen: boolean
  repoPath: string
  conflictFiles: string[]
  onClose: () => void
  onSuccess: () => void
}

type WizardStep = 'overview' | 'resolving' | 'summary'

export function GitVcsConflictWizardModal({
  isOpen,
  repoPath,
  conflictFiles,
  onClose,
  onSuccess,
}: GitVcsConflictWizardModalProps): ReactElement | null {
  const [step, setStep] = useState<WizardStep>('overview')
  const [currentFileIdx, setCurrentFileIdx] = useState(0)
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setStep('overview')
      setCurrentFileIdx(0)
      setResolvedFiles(new Set())
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const currentFile = conflictFiles[currentFileIdx]
  const totalFiles = conflictFiles.length

  const handleResolverClose = () => {
    setStep('overview')
  }

  const handleResolverSuccess = () => {
    setResolvedFiles((prev) => new Set([...prev, currentFile]))

    if (currentFileIdx < totalFiles - 1) {
      // Move to next file
      setCurrentFileIdx(currentFileIdx + 1)
      setStep('overview')
    } else {
      // All files resolved
      setStep('summary')
    }
  }

  const handleConfirmSummary = () => {
    onClose()
    onSuccess()
  }

  // Overlay
  if (step === 'overview' || step === 'summary') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)', // Much darker overlay
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: '#121212', // Solid dark background to prevent bleed-through
            borderRadius: 12,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          {step === 'overview' && (
            <>
              {/* Wizard Header */}
              <div
                style={{
                  padding: '24px',
                  borderBottom: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 600, color: 'white' }}>
                  <span className="codicon codicon-git-merge" style={{ fontSize: 20 }} />
                  Resolve Merge Conflicts
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                  File {currentFileIdx + 1} of {totalFiles} with conflicts
                </div>
              </div>

              {/* File Overview */}
              <div style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Current File
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 14, marginTop: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 4 }}
                  >
                    {currentFile}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Status
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conflictFiles.map((file, idx) => (
                      <div
                        key={file}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 4,
                          background: resolvedFiles.has(file) ? 'rgba(105, 240, 174, 0.1)' : 'var(--bg-secondary)',
                          borderLeft: `3px solid ${resolvedFiles.has(file) ? '#69f0ae' : idx === currentFileIdx ? 'var(--accent)' : 'transparent'}`,
                        }}
                      >
                        <div style={{ fontSize: 11, minWidth: 20 }}>
                          {resolvedFiles.has(file) ? '✓' : idx === currentFileIdx ? '→' : ' '}
                        </div>
                        <span className="mono" style={{ fontSize: 11, flex: 1 }}>
                          {file}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: '12px',
                      background: 'rgba(255, 100, 100, 0.1)',
                      borderLeft: '3px solid #ff6464',
                      borderRadius: 4,
                      fontSize: 12,
                      color: 'var(--text)',
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <button type="button" className="hp-btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  onClick={() => setStep('resolving')}
                >
                  <span className="codicon codicon-git-merge" style={{ marginRight: 6 }} />
                  Open Resolution Studio
                </button>
              </div>
            </>
          )}

          {step === 'summary' && (
            <>
              {/* Summary Header */}
              <div
                style={{
                  padding: '24px',
                  borderBottom: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, #69f0ae 0%, #52d394 100%)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 600, color: 'white' }}>
                  <span className="codicon codicon-check" style={{ fontSize: 20 }} />
                  All Conflicts Resolved
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                  Ready to continue with merge
                </div>
              </div>

              {/* Summary Content */}
              <div style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                    Resolved {resolvedFiles.size} file(s):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.from(resolvedFiles).map((file) => (
                      <div
                        key={file}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 4,
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <span style={{ color: '#69f0ae' }}>✓</span>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {file}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 20, padding: '12px', background: 'var(--bg-secondary)', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Next step: Stage and commit your changes
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    All conflicts have been resolved. You can now continue with the merge or rebase.
                  </div>
                </div>
              </div>

              {/* Summary Footer */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <button type="button" className="hp-btn" onClick={onClose}>
                  Dismiss
                </button>
                <button type="button" className="hp-btn hp-btn-primary" onClick={handleConfirmSummary}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Resolver step
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          maxWidth: 1400,
          width: '96%',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <GitVcsConflictResolver
          repoPath={repoPath}
          filePath={currentFile}
          busy={false}
          onResolved={handleResolverSuccess}
          onError={setError}
          onCancel={handleResolverClose}
        />
      </div>
    </div>
  )
}
