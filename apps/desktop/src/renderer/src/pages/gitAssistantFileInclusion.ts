/** Per-branch paths the user unchecked (excluded from snapshot). */
export type BranchExclusionMap = Map<string, Set<string>>

type StoredBranchExclusions = Record<string, string[]>

const EXCLUSION_STORAGE_PREFIX = 'git-assistant:file-exclusions:v1:'

export function exclusionStorageKey(repoPath: string): string {
  return `${EXCLUSION_STORAGE_PREFIX}${repoPath.trim()}`
}

export function serializeExclusionMap(map: BranchExclusionMap): StoredBranchExclusions {
  const out: StoredBranchExclusions = {}
  for (const [branch, paths] of map) {
    if (paths.size > 0) out[branch] = [...paths]
  }
  return out
}

export function deserializeExclusionMap(data: StoredBranchExclusions): BranchExclusionMap {
  const map: BranchExclusionMap = new Map()
  for (const [branch, paths] of Object.entries(data)) {
    if (paths.length > 0) map.set(branch, new Set(paths))
  }
  return map
}

export function loadBranchExclusionMap(repoPath: string): BranchExclusionMap {
  const key = repoPath.trim()
  if (!key || typeof sessionStorage === 'undefined') return new Map()
  try {
    const raw = sessionStorage.getItem(exclusionStorageKey(key))
    if (!raw) return new Map()
    return deserializeExclusionMap(JSON.parse(raw) as StoredBranchExclusions)
  } catch {
    return new Map()
  }
}

export function saveBranchExclusionMap(repoPath: string, map: BranchExclusionMap): void {
  const key = repoPath.trim()
  if (!key || typeof sessionStorage === 'undefined') return
  try {
    const serialized = serializeExclusionMap(map)
    if (Object.keys(serialized).length === 0) {
      sessionStorage.removeItem(exclusionStorageKey(key))
      return
    }
    sessionStorage.setItem(exclusionStorageKey(key), JSON.stringify(serialized))
  } catch {
    /* quota / private mode */
  }
}

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
  if (excluded.size === 0) excludedByBranch.delete(key)
}

export function setPathsIncluded(
  excludedByBranch: BranchExclusionMap,
  branch: string,
  paths: string[],
  include: boolean,
): void {
  for (const p of new Set(paths)) {
    setPathIncluded(excludedByBranch, branch, p, include)
  }
}

/** Staged paths the user excluded — must be unstaged before a selective snapshot commit. */
export function stagedPathsToUnstageBeforeCommit(
  staged: ReadonlyArray<{ path: string; status: string }>,
  excluded: ReadonlySet<string>,
): string[] {
  return staged
    .filter((f) => f.status !== 'C' && excluded.has(f.path))
    .map((f) => f.path)
}
