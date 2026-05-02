export type GitVcsErrorCode =
  | 'GIT_VCS_NOT_A_REPO'
  | 'GIT_VCS_NO_STAGED'
  | 'GIT_VCS_COMMIT_FAILED'
  | 'GIT_VCS_EMPTY_MESSAGE'
  | 'GIT_VCS_PUSH_REJECTED'
  | 'GIT_VCS_PROTECTED_BRANCH'
  | 'GIT_VCS_INTEGRATION_REQUIRED'
  | 'GIT_VCS_AUTH_FAILED'
  | 'GIT_VCS_DIFF_TOO_LARGE'
  | 'GIT_VCS_NETWORK'
  | 'GIT_VCS_CHECKOUT'
  | 'GIT_VCS_CHECKOUT_DIRTY'
  | 'GIT_VCS_STASH'
  | 'GIT_VCS_STASH_EMPTY'
  | 'GIT_VCS_MERGE'
  | 'GIT_VCS_MERGE_CONFLICT'
  | 'GIT_VCS_MERGE_FF'
  | 'GIT_VCS_MERGE_ABORT'
  | 'GIT_VCS_REBASE'
  | 'GIT_VCS_REBASE_CONFLICT'
  | 'GIT_VCS_REBASE_ABORT'
  | 'GIT_VCS_REBASE_SKIP'
  | 'GIT_VCS_STASH_POP'
  | 'GIT_VCS_STASH_POP_CONFLICT'
  | 'GIT_VCS_STASH_POP_EMPTY'
  | 'GIT_VCS_MERGE_CONTINUE'
  | 'GIT_VCS_REBASE_CONTINUE'

export function parseGitVcsErrorCode(err: unknown): GitVcsErrorCode | null {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]/)
  return (match?.[1] as GitVcsErrorCode) ?? null
}

export function humanizeGitVcsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // [\s\S] so multiline git stderr (after our prefix) still matches; `.` would stop at first newline.
  const match = raw.match(/^\[([A-Z_]+)\]\s*([\s\S]*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'GIT_VCS_NOT_A_REPO') return `This folder is not a Git repository. ${detail}`.trim()
  if (code === 'GIT_VCS_NO_STAGED') return 'Stage at least one file before committing.'
  if (code === 'GIT_VCS_COMMIT_FAILED')
    return `Commit did not complete. ${detail || 'Check your Git identity, hooks, and signing setup.'}`.trim()
  if (code === 'GIT_VCS_EMPTY_MESSAGE') return 'Commit message cannot be empty.'
  if (code === 'GIT_VCS_PUSH_REJECTED')
    return `Remote rejected push. Pull the latest changes first, then push again. ${detail}`.trim()
  if (code === 'GIT_VCS_PROTECTED_BRANCH')
    return `This branch is protected on the remote — you usually cannot push directly. Push your work to a new branch and open a merge or pull request from the host, or ask a maintainer to merge. ${detail}`.trim()
  if (code === 'GIT_VCS_INTEGRATION_REQUIRED')
    return `Integration required — after a quick fetch, your branch is behind the remote. Pull or merge the latest changes, then push again. ${detail}`.trim()
  if (code === 'GIT_VCS_AUTH_FAILED')
    return `Could not authenticate with this remote. Connect GitHub or GitLab in Cloud Git, then retry. ${detail}`.trim()
  if (code === 'GIT_VCS_DIFF_TOO_LARGE')
    return 'This file is too large to preview here — open it in your code editor.'
  if (code === 'GIT_VCS_NETWORK')
    return `Network error during push/pull. Check your connection and try again. ${detail}`.trim()
  if (code === 'GIT_VCS_CHECKOUT_DIRTY')
    return 'Uncommitted changes would be overwritten by this branch switch. Commit or stash first, or confirm in the dialog when switching branches in Git VCS.'
  if (code === 'GIT_VCS_STASH_EMPTY') return 'Nothing to stash — there were no local changes to save.'
  if (code === 'GIT_VCS_STASH') return `Stash failed. ${detail}`.trim()
  if (code === 'GIT_VCS_MERGE_CONFLICT')
    return `Merge stopped with conflicts. Resolve files, stage them, then Continue merge (or Abort merge). ${detail}`.trim()
  if (code === 'GIT_VCS_MERGE_FF')
    return `Fast-forward merge was not possible with --ff-only. Turn off “Fast-forward only” or merge manually. ${detail}`.trim()
  if (code === 'GIT_VCS_MERGE') return `Merge did not complete. ${detail}`.trim()
  if (code === 'GIT_VCS_MERGE_ABORT')
    return `Could not abort merge (no merge in progress, or Git could not clean up). ${detail}`.trim()
  if (code === 'GIT_VCS_REBASE_CONFLICT')
    return `Rebase stopped with conflicts. Fix files, stage them, then Continue rebase (or Abort rebase). ${detail}`.trim()
  if (code === 'GIT_VCS_REBASE') return `Rebase did not complete. ${detail}`.trim()
  if (code === 'GIT_VCS_REBASE_ABORT')
    return `Could not abort rebase (no rebase in progress). ${detail}`.trim()
  if (code === 'GIT_VCS_REBASE_SKIP')
    return `Rebase skip did not complete (no rebase in progress, dirty index, or merge conflict). ${detail}`.trim()
  if (code === 'GIT_VCS_STASH_POP_CONFLICT')
    return `Stash pop stopped with conflicts. Resolve files, then commit; your stash entry may still be on the stack. ${detail}`.trim()
  if (code === 'GIT_VCS_STASH_POP_EMPTY') return 'There is no stash entry to apply.'
  if (code === 'GIT_VCS_STASH_POP') return `Stash pop failed. ${detail}`.trim()
  if (code === 'GIT_VCS_MERGE_CONTINUE')
    return `Merge could not continue. Stage all resolved files, ensure a merge is in progress, or check hook output. ${detail}`.trim()
  if (code === 'GIT_VCS_REBASE_CONTINUE')
    return `Rebase could not continue. Stage resolved files, fix the commit message if prompted, or check hook output. ${detail}`.trim()
  if (code === 'GIT_VCS_CHECKOUT')
    return `Checkout failed. ${detail}`.trim()
  return detail || 'Git VCS operation failed.'
}
