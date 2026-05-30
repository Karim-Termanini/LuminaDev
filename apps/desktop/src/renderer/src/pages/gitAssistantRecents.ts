/** Human-readable "last opened" for Git Assistant recents list. */
export function formatRecentOpened(lastOpenedMs: number, nowMs = Date.now()): string {
  const delta = Math.max(0, nowMs - lastOpenedMs)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(lastOpenedMs).toLocaleDateString()
}

export function recentRepoBasename(path: string): string {
  const trimmed = path.replace(/\/$/, '')
  const parts = trimmed.split('/')
  return parts[parts.length - 1] || trimmed
}

export function recentRepoParentHint(path: string): string {
  const trimmed = path.replace(/\/$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return trimmed
  const parent = trimmed.slice(0, idx)
  if (parent.length > 48) return `…${parent.slice(-44)}`
  return parent
}
