export type GitVcsErrorCode =
  | 'GIT_VCS_NOT_A_REPO'
  | 'GIT_VCS_NO_STAGED'
  | 'GIT_VCS_EMPTY_MESSAGE'
  | 'GIT_VCS_PUSH_REJECTED'
  | 'GIT_VCS_AUTH_FAILED'
  | 'GIT_VCS_DIFF_TOO_LARGE'
  | 'GIT_VCS_NETWORK'

export function parseGitVcsErrorCode(err: unknown): GitVcsErrorCode | null {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]/)
  return (match?.[1] as GitVcsErrorCode) ?? null
}

export function humanizeGitVcsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'GIT_VCS_NOT_A_REPO') return `This folder is not a Git repository. ${detail}`.trim()
  if (code === 'GIT_VCS_NO_STAGED') return 'Stage at least one file before committing.'
  if (code === 'GIT_VCS_EMPTY_MESSAGE') return 'Commit message cannot be empty.'
  if (code === 'GIT_VCS_PUSH_REJECTED')
    return `Remote rejected push. Pull the latest changes first, then push again. ${detail}`.trim()
  if (code === 'GIT_VCS_AUTH_FAILED')
    return `No credentials for this remote. ${detail}`.trim()
  if (code === 'GIT_VCS_DIFF_TOO_LARGE')
    return 'This file is too large to preview here — open it in your code editor.'
  if (code === 'GIT_VCS_NETWORK')
    return `Network error during push/pull. Check your connection and try again. ${detail}`.trim()
  return detail || 'Git VCS operation failed.'
}
