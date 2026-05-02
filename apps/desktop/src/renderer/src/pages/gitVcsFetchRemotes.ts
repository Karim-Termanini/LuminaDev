import type { BranchEntry } from '@linux-dev-home/shared'

/** Remote names inferred from remote-tracking branches (`origin/main` → `origin`). */
export function fetchRemoteOptions(branches: BranchEntry[]): string[] {
  const names = new Set<string>()
  for (const b of branches) {
    if (!b.remote) continue
    const i = b.name.indexOf('/')
    if (i > 0) names.add(b.name.slice(0, i))
  }
  if (names.size === 0) return ['origin']
  return [...names].sort((a, b) => {
    if (a === 'origin') return -1
    if (b === 'origin') return 1
    return a.localeCompare(b)
  })
}
