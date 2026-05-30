/** True when the current branch is not published to its upstream (or has no upstream). */
export function branchNeedsPublishBeforePr(
  ahead: number | null,
  behind: number | null,
): boolean {
  if (ahead == null && behind == null) return true
  return (ahead ?? 0) > 0
}
