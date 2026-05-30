import type { GitVcsOperation } from './gitVcsTypes'

/** Primary CTA for Git Assistant (beginner page). */
export type GitAssistantNextAction =
  | 'connect_cloud'
  | 'open_project'
  | 'open_editor'
  | 'continue_merge'
  | 'pull'
  | 'commit'
  | 'commit_message'
  | 'push'
  | null

export function computeGitAssistantNextAction(input: {
  cloudConnected: boolean
  repoPathTrimmed: string
  gitOperation: GitVcsOperation
  conflictFileCount: number
  stagedCount: number
  unstagedCount: number
  ahead: number | null
  behind: number | null
  commitMessageTrimmed: string
}): GitAssistantNextAction {
  const {
    cloudConnected,
    repoPathTrimmed,
    gitOperation,
    conflictFileCount,
    stagedCount,
    unstagedCount,
    ahead,
    behind,
    commitMessageTrimmed,
  } = input

  if (!repoPathTrimmed) return 'open_project'

  if (conflictFileCount > 0) return 'open_editor'

  if ((gitOperation === 'merging' || gitOperation === 'rebasing') && conflictFileCount === 0) {
    return 'continue_merge'
  }

  if (behind != null && behind > 0) return 'pull'

  const hasWork = stagedCount > 0 || unstagedCount > 0
  const messageReady = commitMessageTrimmed.trim().length > 0
  if (hasWork) {
    if (!messageReady) return 'commit_message'
    return 'commit'
  }

  // Push / connect only when local work is saved and there are unpushed commits.
  if (ahead != null && ahead > 0 && (behind == null || behind === 0)) {
    if (!cloudConnected) return 'connect_cloud'
    return 'push'
  }

  // Local-only / offline: never block commit or idle state on missing GitHub.
  return null
}
