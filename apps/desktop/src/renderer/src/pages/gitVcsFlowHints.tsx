import type { ReactElement, ReactNode } from 'react'
import type { GitVcsOperation } from './GitVcsStateBanner'

export type GitVcsFlowHintsProps = {
  gitOperation: GitVcsOperation
  conflictFileCount: number
  stagedCount: number
  unstagedCount: number
  ahead: number | null
  behind: number | null
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

/**
 * Always-visible workflow hints so users are not left guessing after commit / sync / conflicts.
 * Copy is intentionally plain and ordered (no separate wizard required).
 */
export function GitVcsFlowHints({
  gitOperation,
  conflictFileCount,
  stagedCount,
  unstagedCount,
  ahead,
  behind,
}: GitVcsFlowHintsProps): ReactElement {
  const behindRemote = behind != null && behind > 0
  const aheadOfRemote = ahead != null && ahead > 0

  let title = 'Typical workflow'
  let body: ReactElement

  if (conflictFileCount > 0) {
    title = 'Merge conflicts — what to do'
    body = (
      <Ol>
        <li>
          In the file list, conflicted rows are marked <strong style={{ color: 'var(--text)' }}>C</strong> (red). Select
          one to inspect the diff.
        </li>
        <li>
          Open <strong style={{ color: 'var(--text)' }}>Resolution Studio</strong> from the banner above (or fix markers
          in your editor), then save the file.
        </li>
        <li>
          <strong style={{ color: 'var(--text)' }}>Stage</strong> each resolved file with the + control so Git records
          the fix.
        </li>
        <li>
          When nothing is left to resolve, use <strong style={{ color: 'var(--text)' }}>Continue</strong> in the banner
          to finish the {gitOperation === 'rebasing' ? 'rebase' : 'merge'} (when that button is shown). Use{' '}
          <strong>Abort</strong> only if you want to cancel the whole operation.
        </li>
        {gitOperation === 'none' ? (
          <li>
            If the yellow banner only shows <strong>Resolution Studio</strong>, fix and stage files, then use{' '}
            <strong>Fetch</strong> or click another file so the status refreshes — Continue appears once Git sees no
            remaining conflict markers.
          </li>
        ) : null}
      </Ol>
    )
  } else if (gitOperation === 'merging' || gitOperation === 'rebasing') {
    title = `${gitOperation === 'merging' ? 'Merge' : 'Rebase'} in progress — next step`
    body = (
      <Ol>
        <li>
          All listed conflicts are cleared. <strong style={{ color: 'var(--text)' }}>Stage</strong> any last changes if
          the banner still asks for it.
        </li>
        <li>
          Click <strong style={{ color: 'var(--text)' }}>Continue</strong> in the banner to complete this step. Git may
          run the next rebase commit or finalize the merge.
        </li>
        <li>
          If something went wrong, <strong>Abort</strong> restores the pre-{gitOperation === 'merging' ? 'merge' : 'rebase'}{' '}
          state (you may still need to clean the working tree afterward).
        </li>
      </Ol>
    )
  } else {
    title = 'How to use this page (in order)'
    body = (
      <Ol>
        <li>
          Select a file to see its <strong style={{ color: 'var(--text)' }}>diff</strong> on the right. Use{' '}
          <strong>+ / −</strong> to stage or unstage; you can mix files.
        </li>
        <li>
          <strong style={{ color: 'var(--text)' }}>Commit</strong> uses the message bar at the bottom. If nothing is
          staged but you have local changes, Commit <strong>stages everything</strong> (except merge conflicts) and then
          commits. If some files are already staged, remaining unstaged changes are included in the same commit.
        </li>
        <li>
          <strong style={{ color: 'var(--text)' }}>Fetch</strong> updates what you know about the remote.{' '}
          <strong>Pull</strong> brings remote commits into your branch when you are behind.
        </li>
        {behindRemote ? (
          <li style={{ color: '#ffb74d' }}>
            You are <strong>{behind}</strong> commit(s) behind the remote — Pull or use <strong>Integrate / Sync</strong>{' '}
            before pushing.
          </li>
        ) : null}
        <li>
          <strong style={{ color: 'var(--text)' }}>Push</strong> publishes your branch.
          {aheadOfRemote ? (
            <>
              {' '}
              You are <strong>{ahead}</strong> commit(s) ahead; push will send them upstream (unless the branch is
              protected — then follow the yellow notice to open a PR/MR).
            </>
          ) : (
            <> If the remote rejects the push, read the notice and use the suggested buttons.</>
          )}
        </li>
        <li>
          Use <strong style={{ color: 'var(--text)' }}>Integrate / Sync</strong> when you need merge or rebase with
          another branch, or <strong>Stash pop</strong> to restore stashed work.
        </li>
      </Ol>
    )
  }

  const summaryHint =
    stagedCount === 0 && unstagedCount > 0 ? (
      <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45 }}>
        <span className="codicon codicon-info" style={{ marginRight: 6, opacity: 0.85 }} aria-hidden />
        Nothing staged yet — stage files with <strong>+</strong>, or press <strong>Commit</strong> to stage all and
        commit in one step.
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
          {body}
          {summaryHint}
        </div>
      </div>
    </section>
  )
}
