export function gitErrorString(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()
  if (/permission denied|eacces|operation not permitted/.test(m)) return `[GIT_PERMISSION_DENIED] ${raw}`
  if (/not a git repository|repository not found|does not appear to be a git repository/.test(m)) {
    return `[GIT_NOT_FOUND] ${raw}`
  }
  if (/already exists|would be overwritten|conflict/.test(m)) return `[GIT_CONFLICT] ${raw}`
  if (/timeout|timed out|etimedout/.test(m)) return `[GIT_TIMEOUT] ${raw}`
  if (/could not resolve host|network is unreachable|failed to connect/.test(m)) {
    return `[GIT_NETWORK] ${raw || fallback}`
  }
  if (/invalid|unknown option|bad revision/.test(m)) return `[GIT_INVALID_REQUEST] ${raw}`
  return `[GIT_UNKNOWN] ${raw || fallback}`
}
