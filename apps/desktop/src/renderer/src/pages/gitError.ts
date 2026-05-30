export function parseGitErrorCode(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.match(/^\[([A-Z0-9_]+)\]/)?.[1] ?? null
}

export function humanizeGitError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'GIT_PERMISSION_DENIED') return `Git permission denied. ${detail}`
  if (code === 'GIT_NOT_FOUND') return `Git repository not found or invalid. ${detail}`
  if (code === 'GIT_CONFLICT') return `Git conflict. ${detail}`
  if (code === 'GIT_TIMEOUT') return `Git operation timed out. ${detail}`
  if (code === 'GIT_NETWORK') return `Git network error. ${detail}`
  if (code === 'GIT_INVALID_REQUEST') return `Invalid Git request. ${detail}`
  if (code === 'GIT_CLONE_EXISTS') {
    return (detail || 'That repository folder already exists on disk.').trim()
  }
  if (code === 'GIT_CLONE_FAILED') return `Clone failed. ${detail}`
  if (code === 'GIT_CLONE_ALREADY_HERE') return detail
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }
  return detail || 'Git operation failed.'
}
