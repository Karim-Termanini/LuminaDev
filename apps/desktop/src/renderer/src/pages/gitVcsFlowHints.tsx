import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { GitVcsOperation } from './GitVcsStateBanner'
import type { GitVcsNextAction } from './gitVcsNextAction'

export type GitVcsFlowHintsProps = {
  gitOperation: GitVcsOperation
  conflictFileCount: number
  stagedCount: number
  unstagedCount: number
  ahead: number | null
  behind: number | null
  /** Primary control to call out (green chip + matches highlighted buttons). */
  nextAction: GitVcsNextAction
}

const CHIP: CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 8,
  background: 'rgba(105, 240, 174, 0.2)',
  border: '1px solid rgba(105, 240, 174, 0.75)',
  color: '#c8e6c9',
  fontWeight: 700,
  fontSize: 13,
  verticalAlign: 'middle',
}

function NextChip({ children }: { children: ReactNode }): ReactElement {
  return <span style={CHIP}>{children}</span>
}

function Ol({ children }: { children: ReactNode }): ReactElement {
  return (
    <ol
      style={{
        margin: '10px 0 0',
        paddingLeft: 22,
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </ol>
  )
}

function nextLead(nextAction: GitVcsNextAction): ReactElement | null {
  if (!nextAction) return null
  if (nextAction === 'resolution_studio') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> click <NextChip>Open Resolution Studio</NextChip> in the yellow banner just
        below, pick a side per conflict, save, then use <NextChip>+</NextChip> on each file you fixed.
      </p>
    )
  }
  if (nextAction === 'continue_merge') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> click <NextChip>Continue</NextChip> (green, in the yellow banner or next to
        Integrate) to finish this merge/rebase step.
      </p>
    )
  }
  if (nextAction === 'pull') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> click <NextChip>Pull</NextChip> in the toolbar (same row as Fetch / Push) so
        your branch includes the remote commits you are behind on — then commit or push again.
      </p>
    )
  }
  if (nextAction === 'commit_message') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> type a short message in the <NextChip>Commit message</NextChip> field at the
        bottom (green outline) — then click <NextChip>Commit</NextChip>.
      </p>
    )
  }
  if (nextAction === 'commit') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> click the green-outlined <NextChip>Commit</NextChip> button at the bottom —
        staged files (and any other local changes) go into one commit.
      </p>
    )
  }
  if (nextAction === 'push') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <strong>Do this now:</strong> click <NextChip>Push</NextChip> in the toolbar to publish your commits. If the
        host blocks the branch, follow the yellow notice for a new branch + PR/MR.
      </p>
    )
  }
  return null
}

/**
 * Workflow hints: one “Do this now” line tied to the highlighted control, then short reference bullets.
 */
export function GitVcsFlowHints({
  gitOperation,
  conflictFileCount,
  stagedCount,
  unstagedCount,
  ahead,
  behind,
  nextAction,
}: GitVcsFlowHintsProps): ReactElement {
  const behindRemote = behind != null && behind > 0
  const aheadOfRemote = ahead != null && ahead > 0

  let title = 'Git workflow on this page'
  let body: ReactElement

  if (conflictFileCount > 0) {
    title = 'You have merge conflicts'
    body = (
      <Ol>
        <li>
          Conflicted files show status <strong style={{ color: 'var(--text)' }}>C</strong> (often red). Click one to
          read the diff.
        </li>
        <li>After Resolution Studio (or your editor), stage with <strong>+</strong> so Git sees the fix.</li>
        {gitOperation === 'none' ? (
          <li>
            If <NextChip>Continue</NextChip> is missing, refresh with <strong>Fetch</strong> or select another file until
            the banner updates.
          </li>
        ) : null}
      </Ol>
    )
  } else if (gitOperation === 'merging' || gitOperation === 'rebasing') {
    title = `${gitOperation === 'merging' ? 'Merge' : 'Rebase'} is waiting on you`
    body = (
      <Ol>
        <li>When the index is clean for this step, Continue lets Git move forward or finish.</li>
        <li>
          <strong>Abort</strong> cancels the whole {gitOperation === 'merging' ? 'merge' : 'rebase'} (you may need to
          tidy the tree afterward).
        </li>
      </Ol>
    )
  } else {
    title = 'End-to-end: edit → commit → sync'
    body = (
      <Ol>
        <li>
          <strong>Left:</strong> files. <strong>Right:</strong> diff. <strong>+ / −</strong> stage or unstage.
        </li>
        <li>
          <strong>Bottom:</strong> message + <strong>Commit</strong>. Empty index + local changes → Commit stages all
          (except conflicts) then commits. Partial staging + other edits → one Commit includes the rest too.
        </li>
        <li>
          <strong>Toolbar:</strong> <strong>Fetch</strong> updates remote knowledge; <strong>Pull</strong> when you
          are behind; <strong>Push</strong> when you are ready to publish.
        </li>
        {behindRemote ? (
          <li style={{ color: '#ffb74d' }}>
            Behind by <strong>{behind}</strong> — Pull (or Integrate / Sync) before expecting Push to succeed.
          </li>
        ) : null}
        {aheadOfRemote && !behindRemote ? (
          <li>
            Ahead by <strong>{ahead}</strong> — after commits are clean, Push sends them upstream.
          </li>
        ) : null}
        <li>
          <strong>Integrate / Sync</strong> for merge/rebase flows; stash icon pops the latest stash.
        </li>
      </Ol>
    )
  }

  const lead = nextLead(nextAction)

  const extra =
    nextAction !== 'commit_message' &&
    nextAction !== 'commit' &&
    stagedCount === 0 &&
    unstagedCount > 0 &&
    conflictFileCount === 0 &&
    gitOperation === 'none' ? (
      <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45 }}>
        <span className="codicon codicon-info" style={{ marginRight: 6, opacity: 0.85 }} aria-hidden />
        You can stage with <strong>+</strong> first, or go straight to a commit message + <strong>Commit</strong> — both
        work.
      </p>
    ) : null

  return (
    <section
      className="hp-card"
      aria-label="Workflow hints"
      style={{
        padding: '14px 16px',
        borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-widget))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          className="codicon codicon-map"
          style={{ fontSize: 18, color: 'var(--cg-accent, var(--accent))', flexShrink: 0, marginTop: 1 }}
          aria-hidden
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
          {lead}
          {body}
          {extra}
        </div>
      </div>
    </section>
  )
}
