/** True when the current branch is not published to its upstream (or has no upstream). */
export function branchNeedsPublishBeforePr(
  ahead: number | null,
  behind: number | null,
): boolean {
  if (ahead == null && behind == null) return true
  if (ahead === 0 && (behind ?? 0) === 0) return false
  return (ahead ?? 0) > 0
}

/** Show git push when commits may need publishing (unpushed work is independent of dirty files). */
export function shouldShowGitPush(input: {
  repoPathTrimmed: string
  unborn: boolean
  ahead: number | null
  behind: number | null
  conflictFileCount: number
  gitOperation: string
}): boolean {
  return (
    !!input.repoPathTrimmed &&
    !input.unborn &&
    input.conflictFileCount === 0 &&
    input.gitOperation === 'none' &&
    branchNeedsPublishBeforePr(input.ahead, input.behind)
  )
}
