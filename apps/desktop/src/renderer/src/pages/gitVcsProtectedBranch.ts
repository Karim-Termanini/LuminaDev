/**
 * Suggest a local branch name to bypass protected-branch push rules.
 * Uses `feat/<slug>` with numeric suffixes until the name is not in `localBranchNames`.
 */
export function suggestBypassBranchName(currentBranch: string, localBranchNames: ReadonlySet<string>): string {
  const slugPart = (s: string): string => {
    const t = s
      .trim()
      .replace(/[/\\]+/g, '-')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .toLowerCase()
    const u = t.slice(0, 48)
    return u || 'work'
  }

  let core = slugPart(currentBranch)
  if (core === 'main' || core === 'master' || core === 'develop' || core === 'dev') {
    core = `from-${core}`
  }

  let candidate = `feat/${core}`
  let n = 2
  while (localBranchNames.has(candidate)) {
    candidate = `feat/${core}-${n}`
    n += 1
  }
  return candidate
}

/** Client-side guard before `git checkout -b` (Git rules are stricter; this catches obvious mistakes). */
export function isPlausibleGitBranchName(name: string): boolean {
  const t = name.trim()
  if (t.length === 0 || t.length > 244) return false
  if (/\s/.test(t) || t.includes('..') || t.includes('@{') || t.includes('\\')) return false
  return /^[a-zA-Z0-9/_.-]+$/.test(t)
}
