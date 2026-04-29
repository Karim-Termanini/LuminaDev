export function terminalErrorString(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()

  if (/permission denied|eacces|operation not permitted/.test(m)) {
    return `[TERMINAL_PERMISSION_DENIED] ${raw}`
  }
  if (/enoent|not found|no such file or directory/.test(m)) {
    return `[TERMINAL_NOT_FOUND] ${raw}`
  }
  if (/pty|node-pty|forkpty/.test(m)) {
    return `[TERMINAL_PTY_UNAVAILABLE] ${raw || fallback}`
  }
  if (/timeout|timed out|etimedout/.test(m)) {
    return `[TERMINAL_TIMEOUT] ${raw || fallback}`
  }
  return `[TERMINAL_UNKNOWN] ${raw || fallback}`
}
