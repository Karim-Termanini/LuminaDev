import type { ReactElement } from 'react'
import { useEffect, useState, useCallback } from 'react'
import type { GitVcsConflictFile } from '@linux-dev-home/shared'

export type GitVcsConflictResolverProps = {
  repoPath: string
  filePath: string
  busy: boolean
  onResolved: () => void
  onError: (msg: string) => void
  onCancel: () => void
}

type ResolutionState = 'ours' | 'theirs' | 'both' | 'manual'

type HunkResolution = {
  hunkId: string
  resolution: ResolutionState
  mergedContent?: string
}

export function GitVcsConflictResolver({
  repoPath,
  filePath,
  busy,
  onResolved,
  onError,
  onCancel,
}: GitVcsConflictResolverProps): ReactElement {
  const [conflictData, setConflictData] = useState<GitVcsConflictFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentHunkIdx, setCurrentHunkIdx] = useState(0)
  const [hunkResolutions, setHunkResolutions] = useState<Map<string, HunkResolution>>(new Map())
  const [editingMerged, setEditingMerged] = useState<string>('')
  const [resolving, setResolving] = useState(false)

  // Fetch conflict data
  useEffect(() => {
    if (!repoPath || !filePath) return
    setLoading(true)
    window.dh
      .gitVcsConflictHunks({ repoPath, filePath })
      .then((res) => {
        if (!res.ok) {
          onError(res.error ?? 'Failed to load conflict hunks.')
          return
        }
        const data = res as GitVcsConflictFile
        setConflictData(data)
        // Initialize editing merged content with the current merged state
        setEditingMerged(data.merged ?? '')
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [repoPath, filePath, onError])

  const currentHunk = conflictData?.hunks?.[currentHunkIdx]
  const totalHunks = conflictData?.hunks?.length ?? 0
  const allResolved = hunkResolutions.size === totalHunks && totalHunks > 0

  useEffect(() => {
    if (currentHunk) {
      setEditingMerged(currentHunk.ours) // Default to ours for editing
    }
  }, [currentHunk])

  const resolveHunk = useCallback(
    async (resolution: ResolutionState, manualContent?: string) => {
      if (!currentHunk) return

      let finalContent = ''
      if (resolution === 'ours') finalContent = currentHunk.ours
      else if (resolution === 'theirs') finalContent = currentHunk.theirs
      else if (resolution === 'both') finalContent = `${currentHunk.ours}\n${currentHunk.theirs}`
      else if (resolution === 'manual') finalContent = manualContent ?? ''

      const hunkRes: HunkResolution = { hunkId: currentHunk.id, resolution, mergedContent: finalContent }
      setHunkResolutions((prev) => new Map(prev).set(currentHunk.id, hunkRes))

      // Move to next unresolved hunk or finish
      if (currentHunkIdx < totalHunks - 1) {
        setCurrentHunkIdx(currentHunkIdx + 1)
        // Reset manual editing area for next hunk
        setEditingMerged('') 
      }
    },
    [currentHunk, currentHunkIdx, totalHunks],
  )

  const handleAcceptOurs = useCallback(() => {
    void resolveHunk('ours')
  }, [resolveHunk])

  const handleAcceptTheirs = useCallback(() => {
    void resolveHunk('theirs')
  }, [resolveHunk])

  const handleAcceptBoth = useCallback(() => {
    void resolveHunk('both')
  }, [resolveHunk])

  const handleManualResolution = useCallback(async () => {
    if (!currentHunk) return
    await resolveHunk('manual', editingMerged)
  }, [currentHunk, editingMerged, resolveHunk])

  const handleFinalize = useCallback(async () => {
    if (!currentHunk) return
    setResolving(true)

    try {
      // Apply all hunk resolutions to the actual file
      for (const [, res] of hunkResolutions) {
        const ipcRes = await window.dh.gitVcsResolveHunk({
          repoPath,
          filePath,
          hunkId: res.hunkId,
          resolution: res.resolution,
          mergedContent: res.mergedContent,
        })
        if (!ipcRes.ok) {
          onError(ipcRes.error ?? 'Failed to resolve hunk.')
          setResolving(false)
          return
        }
      }
      onResolved()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setResolving(false)
    }
  }, [hunkResolutions, repoPath, filePath, onError, onResolved, currentHunk])

  const isDisabled = busy || resolving || loading

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        Loading conflict resolver…
      </div>
    )
  }

  if (!conflictData || (totalHunks === 0 && !conflictData.ours && !conflictData.theirs)) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        No conflict data found for this file.
      </div>
    )
  }

  if (totalHunks === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 32, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
         <div style={{ fontSize: 18, fontWeight: 600 }}>Whole File Conflict</div>
         <div style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400 }}>
           This file has a conflict but no markers were found (likely a binary file or structural conflict).
           Pick which version to keep.
         </div>
         <div style={{ display: 'flex', gap: 12 }}>
            <button className="hp-btn hp-btn-primary" onClick={() => void window.dh.gitVcsResolveConflict({ repoPath, filePath, resolution: 'ours' }).then(onResolved)}>
               Keep Mine (ours)
            </button>
            <button className="hp-btn hp-btn-primary" onClick={() => void window.dh.gitVcsResolveConflict({ repoPath, filePath, resolution: 'theirs' }).then(onResolved)}>
               Take Theirs
            </button>
         </div>
         <button className="hp-btn" onClick={onCancel} style={{ marginTop: 20 }}>Cancel</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header with file info and progress */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: 'var(--bg-secondary)',
        }}
      >
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.04 }}>
            CONFLICT RESOLVER
          </div>
          <div className="mono" style={{ marginTop: 4, fontSize: 13 }}>
            {filePath}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            Hunk {currentHunkIdx + 1} of {totalHunks}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="hp-btn" disabled={isDisabled} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={isDisabled || !allResolved}
            onClick={() => void handleFinalize()}
          >
            {resolving ? 'Finalizing…' : 'Finalize Merge'}
          </button>
        </div>
      </div>

      {/* Three-column diff view */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', flex: 1, overflow: 'hidden', gap: 0 }}>
        {/* LEFT: OURS */}
        <ConflictColumn label="Current (ours)" content={currentHunk?.ours ?? ''} accent="#69f0ae" />

        {/* CENTER: MERGED (editable) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: '#ffd700',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              letterSpacing: 0.03,
            }}
          >
            Resolved Result (editable)
          </div>
          <textarea
            value={editingMerged}
            onChange={(e) => setEditingMerged(e.target.value)}
            disabled={isDisabled}
            style={{
              flex: 1,
              margin: 0,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: 'monospace',
              border: 'none',
              color: 'var(--text)',
              background: 'transparent',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>

        {/* RIGHT: THEIRS */}
        <ConflictColumn label="Incoming (theirs)" content={currentHunk?.theirs ?? ''} accent="#82b1ff" />
      </div>

      {/* Action buttons for this hunk */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
          background: 'var(--bg-secondary)',
        }}
      >
        <button
          type="button"
          className="hp-btn"
          disabled={isDisabled}
          onClick={handleAcceptOurs}
          title="Use only your changes"
        >
          Keep mine (ours)
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={isDisabled}
          onClick={handleAcceptTheirs}
          title="Use only their changes"
        >
          Take theirs
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={isDisabled}
          onClick={handleAcceptBoth}
          title="Combine both changes"
        >
          Keep both
        </button>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={isDisabled}
          onClick={handleManualResolution}
          title="Use the manually edited version above"
        >
          Use edited
        </button>
      </div>

      {/* Navigation between hunks */}
      {totalHunks > 1 && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
          }}
        >
          <button
            type="button"
            className="hp-btn"
            disabled={isDisabled || currentHunkIdx === 0}
            onClick={() => setCurrentHunkIdx(Math.max(0, currentHunkIdx - 1))}
          >
            ← Previous
          </button>
          <span>
            Hunk {currentHunkIdx + 1} of {totalHunks} • {hunkResolutions.size} resolved
          </span>
          <button
            type="button"
            className="hp-btn"
            disabled={isDisabled || currentHunkIdx >= totalHunks - 1}
            onClick={() => setCurrentHunkIdx(Math.min(totalHunks - 1, currentHunkIdx + 1))}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function ConflictColumn({
  label,
  content,
  accent,
}: {
  label: string
  content: string
  accent: string
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          letterSpacing: 0.03,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          fontSize: 12,
          lineHeight: 1.6,
          fontFamily: 'monospace',
          overflow: 'auto',
          flex: 1,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          color: 'var(--text)',
          background: 'transparent',
        }}
      >
        {content || '(empty)'}
      </pre>
    </div>
  )
}
