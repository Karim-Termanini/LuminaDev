import type { ReactElement } from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import type { GitVcsConflictFile, GitVcsConflictHunk } from '@linux-dev-home/shared'

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

type UndoEntry = {
  hunkId: string
  previousResolution: HunkResolution | null
  previousHunkIdx: number
  previousMerged: string
}

const OURS_ACCENT = '#69f0ae'
const THEIRS_ACCENT = '#82b1ff'
const MERGED_ACCENT = '#ffd740'
const OURS_BG = 'rgba(105,240,174,0.08)'
const THEIRS_BG = 'rgba(130,177,255,0.08)'
const OURS_LINE_BG = 'rgba(105,240,174,0.15)'
const THEIRS_LINE_BG = 'rgba(130,177,255,0.15)'

function computeDiffLines(ours: string, theirs: string): { oursLines: DiffLine[]; theirsLines: DiffLine[] } {
  const oursArr = ours.split('\n')
  const theirsArr = theirs.split('\n')
  const oursLines: DiffLine[] = []
  const theirsLines: DiffLine[] = []

  const theirsSet = new Set(theirsArr)
  const oursSet = new Set(oursArr)

  for (const line of oursArr) {
    oursLines.push({ text: line, type: theirsSet.has(line) ? 'common' : 'ours-only' })
  }
  for (const line of theirsArr) {
    theirsLines.push({ text: line, type: oursSet.has(line) ? 'common' : 'theirs-only' })
  }
  return { oursLines, theirsLines }
}

type DiffLine = {
  text: string
  type: 'common' | 'ours-only' | 'theirs-only'
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
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const mergedRef = useRef<HTMLTextAreaElement>(null)

  const currentHunk = conflictData?.hunks?.[currentHunkIdx]
  const totalHunks = conflictData?.hunks?.length ?? 0
  const allResolved = hunkResolutions.size === totalHunks && totalHunks > 0
  const currentResolution = currentHunk ? hunkResolutions.get(currentHunk.id) : undefined

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
        setEditingMerged(data.merged ?? '')
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [repoPath, filePath, onError])

  useEffect(() => {
    if (currentHunk) {
      const existing = hunkResolutions.get(currentHunk.id)
      if (existing?.mergedContent !== undefined) {
        setEditingMerged(existing.mergedContent)
      } else {
        setEditingMerged(currentHunk.ours)
      }
    }
  }, [currentHunk, hunkResolutions])

  const resolveHunk = useCallback(
    (resolution: ResolutionState, manualContent?: string) => {
      if (!currentHunk) return

      let finalContent = ''
      if (resolution === 'ours') finalContent = currentHunk.ours
      else if (resolution === 'theirs') finalContent = currentHunk.theirs
      else if (resolution === 'both') finalContent = `${currentHunk.ours}\n${currentHunk.theirs}`
      else if (resolution === 'manual') finalContent = manualContent ?? ''

      const previousResolution = hunkResolutions.get(currentHunk.id) ?? null
      const undoEntry: UndoEntry = {
        hunkId: currentHunk.id,
        previousResolution,
        previousHunkIdx: currentHunkIdx,
        previousMerged: editingMerged,
      }

      const hunkRes: HunkResolution = { hunkId: currentHunk.id, resolution, mergedContent: finalContent }
      setHunkResolutions((prev) => new Map(prev).set(currentHunk.id, hunkRes))
      setUndoStack((prev) => [...prev, undoEntry])
      setEditingMerged(finalContent)

      if (currentHunkIdx < totalHunks - 1) {
        setCurrentHunkIdx(currentHunkIdx + 1)
      }
    },
    [currentHunk, currentHunkIdx, totalHunks, hunkResolutions, editingMerged],
  )

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    setCurrentHunkIdx(entry.previousHunkIdx)
    setEditingMerged(entry.previousMerged)
    if (entry.previousResolution) {
      setHunkResolutions((prev) => {
        const next = new Map(prev)
        next.set(entry.hunkId, entry.previousResolution!)
        return next
      })
    } else {
      setHunkResolutions((prev) => {
        const next = new Map(prev)
        next.delete(entry.hunkId)
        return next
      })
    }
  }, [undoStack])

  const insertLineFromSide = useCallback(
    (side: 'ours' | 'theirs', lineText: string) => {
      if (!currentHunk) return
      const current = editingMerged
      const insertion = current.length > 0 && !current.endsWith('\n') ? `\n${lineText}` : current.length > 0 ? `${lineText}` : lineText
      setEditingMerged(current + (current.length > 0 ? '\n' : '') + lineText)
      void insertion
    },
    [currentHunk, editingMerged],
  )

  const handleFinalize = useCallback(async () => {
    if (!currentHunk) return
    setResolving(true)
    try {
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === '1') { e.preventDefault(); resolveHunk('ours') }
      else if (e.key === '2') { e.preventDefault(); resolveHunk('theirs') }
      else if (e.key === '3') { e.preventDefault(); resolveHunk('both') }
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleUndo() }
      else if (e.key === 'ArrowLeft' && currentHunkIdx > 0) { e.preventDefault(); setCurrentHunkIdx(currentHunkIdx - 1) }
      else if (e.key === 'ArrowRight' && currentHunkIdx < totalHunks - 1) { e.preventDefault(); setCurrentHunkIdx(currentHunkIdx + 1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [resolveHunk, handleUndo, currentHunkIdx, totalHunks])

  const isDisabled = busy || resolving || loading

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 20 }} />
        Loading conflict data…
      </div>
    )
  }

  if (!conflictData || (totalHunks === 0 && !conflictData.ours && !conflictData.theirs)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
        No conflict data found for this file.
      </div>
    )
  }

  if (totalHunks === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 32, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span className="codicon codicon-warning" style={{ fontSize: 48, color: '#ff9800' }} />
        <div style={{ fontSize: 18, fontWeight: 600 }}>Whole File Conflict</div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, fontSize: 13, lineHeight: 1.5 }}>
          This file has a conflict but no markers were found (likely a binary file or structural conflict).
          Pick which version to keep.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="hp-btn hp-btn-primary" onClick={() => void window.dh.gitVcsResolveConflict({ repoPath, filePath, resolution: 'ours' }).then(onResolved)}>
            <span className="codicon codicon-check" style={{ marginRight: 6 }} /> Keep Mine
          </button>
          <button className="hp-btn hp-btn-primary" style={{ background: THEIRS_ACCENT }} onClick={() => void window.dh.gitVcsResolveConflict({ repoPath, filePath, resolution: 'theirs' }).then(onResolved)}>
            <span className="codicon codicon-arrow-right" style={{ marginRight: 6 }} /> Take Theirs
          </button>
        </div>
        <button className="hp-btn" onClick={onCancel} style={{ marginTop: 8 }}>Cancel</button>
      </div>
    )
  }

  const { oursLines, theirsLines } = currentHunk
    ? computeDiffLines(currentHunk.ours, currentHunk.theirs)
    : { oursLines: [] as DiffLine[], theirsLines: [] as DiffLine[] }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="codicon codicon-git-merge" style={{ fontSize: 18, color: '#ff9800' }} />
          <div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.04, textTransform: 'uppercase' }}>
              Conflict Resolution Studio
            </div>
            <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>{filePath}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {undoStack.length > 0 && (
            <button type="button" className="hp-btn hp-btn-sm" onClick={handleUndo} title="Undo (Ctrl+Z)">
              <span className="codicon codicon-discard" style={{ marginRight: 4 }} /> Undo
            </button>
          )}
          <button type="button" className="hp-btn" disabled={isDisabled} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={isDisabled || !allResolved}
            onClick={() => void handleFinalize()}
          >
            {resolving ? (
              <><span className="codicon codicon-loading codicon-modifier-spin" style={{ marginRight: 6 }} /> Finalizing…</>
            ) : (
              <><span className="codicon codicon-check" style={{ marginRight: 6 }} /> Finalize Merge</>
            )}
          </button>
        </div>
      </div>

      {/* ── Hunk Minimap ── */}
      <HunkMinimap
        hunks={conflictData?.hunks ?? []}
        resolutions={hunkResolutions}
        currentIdx={currentHunkIdx}
        onSelect={setCurrentHunkIdx}
      />

      {/* ── Three-column diff view ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', flex: 1, overflow: 'hidden' }}>
        {/* LEFT: OURS */}
        <DiffColumn
          label="Yours (ours)"
          accent={OURS_ACCENT}
          bgTint={OURS_BG}
          lineBg={OURS_LINE_BG}
          diffLines={oursLines}
          lineType="ours-only"
          onLineClick={(line) => insertLineFromSide('ours', line)}
          hunk={currentHunk}
          resolution={currentResolution}
        />

        {/* CENTER: MERGED (editable) */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
          <div style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: MERGED_ACCENT,
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            letterSpacing: 0.03,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,215,64,0.04)',
          }}>
            <span className="codicon codicon-edit" style={{ fontSize: 12 }} />
            Merged Result
            {currentResolution && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(105,240,174,0.15)',
                color: OURS_ACCENT,
              }}>
                {currentResolution.resolution}
              </span>
            )}
          </div>
          <textarea
            ref={mergedRef}
            value={editingMerged}
            onChange={(e) => setEditingMerged(e.target.value)}
            disabled={isDisabled}
            spellCheck={false}
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
        <DiffColumn
          label="Incoming (theirs)"
          accent={THEIRS_ACCENT}
          bgTint={THEIRS_BG}
          lineBg={THEIRS_LINE_BG}
          diffLines={theirsLines}
          lineType="theirs-only"
          onLineClick={(line) => insertLineFromSide('theirs', line)}
          hunk={currentHunk}
          resolution={currentResolution}
        />
      </div>

      {/* ── Action bar ── */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
        background: 'rgba(0,0,0,0.25)',
        alignItems: 'center',
      }}>
        <button type="button" className="hp-btn" disabled={isDisabled} onClick={() => resolveHunk('ours')} title="Keep only your changes (1)">
          <span className="codicon codicon-check" style={{ marginRight: 4, color: OURS_ACCENT }} /> Keep Mine
          <kbd style={kbdStyle}>1</kbd>
        </button>
        <button type="button" className="hp-btn" disabled={isDisabled} onClick={() => resolveHunk('theirs')} title="Take only their changes (2)">
          <span className="codicon codicon-arrow-right" style={{ marginRight: 4, color: THEIRS_ACCENT }} /> Take Theirs
          <kbd style={kbdStyle}>2</kbd>
        </button>
        <button type="button" className="hp-btn" disabled={isDisabled} onClick={() => resolveHunk('both')} title="Combine both sides (3)">
          <span className="codicon codicon-fold" style={{ marginRight: 4 }} /> Keep Both
          <kbd style={kbdStyle}>3</kbd>
        </button>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          disabled={isDisabled}
          onClick={() => resolveHunk('manual', editingMerged)}
          title="Use the manually edited merged content"
        >
          <span className="codicon codicon-edit" style={{ marginRight: 4 }} /> Use Edited
        </button>
      </div>

      {/* ── Navigation bar ── */}
      <div style={{
        padding: '6px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        fontSize: 12,
        color: 'var(--text-muted)',
        background: 'rgba(0,0,0,0.2)',
      }}>
        <button
          type="button"
          className="hp-btn hp-btn-sm"
          disabled={isDisabled || currentHunkIdx === 0}
          onClick={() => setCurrentHunkIdx(Math.max(0, currentHunkIdx - 1))}
        >
          <span className="codicon codicon-chevron-left" /> Prev
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Hunk {currentHunkIdx + 1} / {totalHunks}
          <span style={{ color: OURS_ACCENT }}>{hunkResolutions.size} resolved</span>
          {totalHunks - hunkResolutions.size > 0 && (
            <span style={{ color: '#ff9800' }}>{totalHunks - hunkResolutions.size} remaining</span>
          )}
        </span>
        <button
          type="button"
          className="hp-btn hp-btn-sm"
          disabled={isDisabled || currentHunkIdx >= totalHunks - 1}
          onClick={() => setCurrentHunkIdx(Math.min(totalHunks - 1, currentHunkIdx + 1))}
        >
          Next <span className="codicon codicon-chevron-right" />
        </button>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  marginLeft: 6,
  padding: '1px 5px',
  fontSize: 10,
  fontFamily: 'monospace',
  borderRadius: 3,
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'var(--text-muted)',
}

/* ── Hunk Minimap ── */

function HunkMinimap({
  hunks,
  resolutions,
  currentIdx,
  onSelect,
}: {
  hunks: GitVcsConflictHunk[]
  resolutions: Map<string, HunkResolution>
  currentIdx: number
  onSelect: (idx: number) => void
}): ReactElement {
  if (hunks.length <= 1) return <></>
  return (
    <div style={{
      padding: '6px 16px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      gap: 4,
      flexShrink: 0,
      overflowX: 'auto',
      background: 'rgba(0,0,0,0.15)',
    }}>
      {hunks.map((h, idx) => {
        const res = resolutions.get(h.id)
        const isCurrent = idx === currentIdx
        const resolved = !!res
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(idx)}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              borderRadius: 4,
              border: `1px solid ${isCurrent ? (resolved ? OURS_ACCENT : '#ff9800') : 'var(--border)'}`,
              background: isCurrent ? (resolved ? 'rgba(105,240,174,0.15)' : 'rgba(255,152,0,0.15)') : resolved ? 'rgba(105,240,174,0.06)' : 'transparent',
              color: resolved ? OURS_ACCENT : isCurrent ? '#ff9800' : 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            title={`Hunk ${idx + 1}: L${h.startLine}-${h.endLine} (${resolved ? res.resolution : 'unresolved'})`}
          >
            {resolved && <span style={{ marginRight: 3 }}>&#10003;</span>}
            {idx + 1}
          </button>
        )
      })}
    </div>
  )
}

/* ── Diff Column with line numbers and click-to-accept ── */

function DiffColumn({
  label,
  accent,
  bgTint,
  lineBg,
  diffLines,
  lineType,
  onLineClick,
  hunk,
  resolution,
}: {
  label: string
  accent: string
  bgTint: string
  lineBg: string
  diffLines: DiffLine[]
  lineType: 'ours-only' | 'theirs-only'
  onLineClick: (lineText: string) => void
  hunk: GitVcsConflictHunk | undefined
  resolution: HunkResolution | undefined
}): ReactElement {
  const isResolved = !!resolution
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: accent,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        letterSpacing: 0.03,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: bgTint,
      }}>
        <span className={`codicon codicon-${lineType === 'ours-only' ? 'account' : 'arrow-right'}`} style={{ fontSize: 12 }} />
        {label}
        {isResolved && (
          <span className="codicon codicon-check" style={{ marginLeft: 'auto', fontSize: 12, color: OURS_ACCENT }} />
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: bgTint }}>
        {diffLines.map((line, i) => {
          const isUnique = line.type === lineType
          return (
            <div
              key={i}
              onClick={() => isUnique && onLineClick(line.text)}
              style={{
                display: 'flex',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
                background: isUnique ? lineBg : 'transparent',
                cursor: isUnique ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (isUnique) e.currentTarget.style.background = lineBg.replace('0.15', '0.3') }}
              onMouseLeave={(e) => { if (isUnique) e.currentTarget.style.background = lineBg }}
              title={isUnique ? 'Click to add to merged result' : undefined}
            >
              <span style={{
                minWidth: 32,
                padding: '0 6px',
                textAlign: 'right',
                color: 'var(--text-muted)',
                opacity: 0.4,
                fontSize: 10,
                userSelect: 'none',
                flexShrink: 0,
              }}>
                {(hunk?.startLine ?? 0) + i}
              </span>
              <span style={{
                width: 4,
                flexShrink: 0,
                background: isUnique ? accent : 'transparent',
                opacity: isUnique ? 0.6 : 0,
                borderRadius: 1,
              }} />
              <span style={{
                padding: '0 8px',
                whiteSpace: 'pre',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {line.text || ' '}
              </span>
              {isUnique && (
                <span style={{
                  paddingRight: 6,
                  opacity: 0,
                  fontSize: 10,
                  color: accent,
                  userSelect: 'none',
                  transition: 'opacity 0.1s',
                }}
                  className="diff-line-hint"
                >
                  +
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
