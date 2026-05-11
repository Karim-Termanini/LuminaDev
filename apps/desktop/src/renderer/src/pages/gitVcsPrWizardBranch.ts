import type { BranchEntry } from '@linux-dev-home/shared'

/** `origin/main` + remoteName `origin` → `main` for host API base branch. */
export function stripRemoteBranchPrefix(remoteName: string, refShort: string): string | null {
  const prefix = `${remoteName}/`
  if (!refShort.startsWith(prefix)) return null
  const rest = refShort.slice(prefix.length)
  return rest.length > 0 ? rest : null
}

/** Local branch names and `{remote}/x` short names mapped to host branch `x`, excluding the current branch. */
export function computeBaseBranchOptions(
  branches: BranchEntry[],
  currentBranch: string,
  remoteName: string,
): string[] {
  const set = new Set<string>()
  for (const b of branches) {
    if (!b.remote) {
      if (b.name !== currentBranch) set.add(b.name)
      continue
    }
    const stripped = stripRemoteBranchPrefix(remoteName, b.name)
    if (stripped && stripped !== currentBranch) set.add(stripped)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function defaultBaseBranch(candidates: string[]): string {
  for (const c of ['main', 'master', 'develop', 'dev']) {
    if (candidates.includes(c)) return c
  }
  return candidates[0] ?? ''
}
