import type { FileEntry } from '@linux-dev-home/shared'

export type GitVcsFileSelection = { path: string; staged: boolean }

/** After status refresh, keep diff target valid (staged vs unstaged can flip). */
export function reconcileGitVcsSelection(
  prev: GitVcsFileSelection | null,
  nextStaged: FileEntry[],
  nextUnstaged: FileEntry[],
): GitVcsFileSelection | null {
  if (!prev) return null
  const inS = nextStaged.some((f) => f.path === prev.path)
  const inU = nextUnstaged.some((f) => f.path === prev.path)
  if (!inS && !inU) return null
  if (inS && inU) return { path: prev.path, staged: prev.staged }
  if (inS) return { path: prev.path, staged: true }
  return { path: prev.path, staged: false }
}
