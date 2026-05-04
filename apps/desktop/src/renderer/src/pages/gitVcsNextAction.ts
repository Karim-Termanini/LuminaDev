import type { CSSProperties } from 'react'

import type { GitVcsOperation } from './GitVcsStateBanner'
import { GIT_VCS_NEXT_ACTION_RING } from './gitVcsUiTokens'

/** Single primary control the user should use next (drives hint copy + green highlight). */
export type GitVcsNextAction =
  | 'resolution_studio'
  | 'continue_merge'
  | 'pull'
  | 'commit'
  | 'commit_message'
  | 'push'
  | null

export function computeGitVcsNextAction(input: {
  gitOperation: GitVcsOperation
  conflictFileCount: number
  stagedCount: number
  unstagedCount: number
  ahead: number | null
  behind: number | null
  commitMessageTrimmed: string
}): GitVcsNextAction {
  const {
    gitOperation,
    conflictFileCount,
    stagedCount,
    unstagedCount,
    ahead,
    behind,
    commitMessageTrimmed,
  } = input

  if (conflictFileCount > 0) return 'resolution_studio'
  if ((gitOperation === 'merging' || gitOperation === 'rebasing') && conflictFileCount === 0) {
    return 'continue_merge'
  }
  if (behind != null && behind > 0) return 'pull'

  const hasWork = stagedCount > 0 || unstagedCount > 0
  if (hasWork) {
    if (!commitMessageTrimmed) return 'commit_message'
    return 'commit'
  }

  if (ahead != null && ahead > 0 && (behind == null || behind === 0)) return 'push'

  return null
}

/** Merge green “next step” ring when `next` matches `want`. */
export function nextActionButtonStyle(
  next: GitVcsNextAction,
  want: Exclude<GitVcsNextAction, null>,
  base: CSSProperties,
): CSSProperties {
  return next === want ? { ...base, ...GIT_VCS_NEXT_ACTION_RING } : base
}

