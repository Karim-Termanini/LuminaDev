import type { GitRepoEntry } from '@linux-dev-home/shared'

type GitRecentListResult = { ok: boolean; repos?: GitRepoEntry[]; error?: string }

export function assertGitRecentList(result: unknown, fallback = 'Failed to load recent repositories.'): GitRepoEntry[] {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as GitRecentListResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
  return Array.isArray(maybe.repos) ? maybe.repos : []
}
