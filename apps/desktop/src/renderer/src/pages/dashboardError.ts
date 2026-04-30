export function humanizeDashboardError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code === 'DOCKER_PERMISSION_DENIED') return `Docker permission denied. ${detail}`
  if (code === 'DOCKER_UNAVAILABLE') return `Docker daemon/socket unavailable. ${detail}`
  if (code === 'DOCKER_TIMEOUT') return `Docker operation timed out. ${detail}`
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }

  if (/permission denied|eacces/i.test(raw)) {
    return 'Permission denied. Some metrics might require elevated access.'
  }
  if (/no such file/i.test(raw)) {
    return 'System metrics source not found (non-Linux system?).'
  }
  if (/timeout/i.test(raw)) {
    return 'Metrics collection timed out.'
  }

  return detail || 'Failed to collect dashboard metrics.'
}
