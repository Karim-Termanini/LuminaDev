/** True when the current branch is not published to its upstream (or has no upstream). */
export function branchNeedsPublishBeforePr(
  ahead: number | null,
  behind: number | null,
): boolean {
  if (ahead == null && behind == null) return true
  if (ahead === 0 && (behind ?? 0) === 0) return false
  return (ahead ?? 0) > 0
}

/** Show git push when the working tree is clean and commits may need publishing. */
export function shouldShowGitPush(input: {
  repoPathTrimmed: string
  hasLocalChanges: boolean
  unborn: boolean
  ahead: number | null
  behind: number | null
  conflictFileCount: number
  gitOperation: string
}): boolean {
  return (
    !!input.repoPathTrimmed &&
    !input.hasLocalChanges &&
    !input.unborn &&
    input.conflictFileCount === 0 &&
    input.gitOperation === 'none' &&
    branchNeedsPublishBeforePr(input.ahead, input.behind)
  )
}
