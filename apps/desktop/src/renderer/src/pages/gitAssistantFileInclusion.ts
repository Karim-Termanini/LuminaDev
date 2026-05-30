/** Per-branch paths the user unchecked (excluded from snapshot). */
export type BranchExclusionMap = Map<string, Set<string>>

export function buildIncludedFromPaths(
  paths: string[],
  branch: string,
  excludedByBranch: BranchExclusionMap,
): Set<string> {
  const excluded = excludedByBranch.get(branch.trim()) ?? new Set<string>()
  const next = new Set<string>()
  for (const p of paths) {
    if (!excluded.has(p)) next.add(p)
  }
  return next
}

export function setPathIncluded(
  excludedByBranch: BranchExclusionMap,
  branch: string,
  path: string,
  include: boolean,
): void {
  const key = branch.trim()
  if (!key) return
  let excluded = excludedByBranch.get(key)
  if (!excluded) {
    excluded = new Set<string>()
    excludedByBranch.set(key, excluded)
  }
  if (include) excluded.delete(path)
  else excluded.add(path)
}
