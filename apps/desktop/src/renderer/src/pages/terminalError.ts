export function humanizeTerminalError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code === 'TERMINAL_PERMISSION_DENIED') return `Terminal permission denied. ${detail}`
  if (code === 'TERMINAL_NOT_FOUND') return `No compatible terminal binary found. ${detail}`
  if (code === 'TERMINAL_PTY_UNAVAILABLE') return `Embedded PTY is unavailable in this environment. ${detail}`
  if (code === 'TERMINAL_TIMEOUT') return `Terminal operation timed out. ${detail}`
  return detail || 'Terminal operation failed.'
}
