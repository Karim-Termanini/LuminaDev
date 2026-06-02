import type { GitRepoEntry } from '@linux-dev-home/shared'

export type GitOpResult = { ok: boolean; error?: string }

type GitRecentListResult = { ok: boolean; repos?: GitRepoEntry[]; error?: string }

export function assertGitOk(result: unknown, fallback = 'Git operation failed.'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as GitOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}

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
