export type GitProviderFamily = 'github' | 'gitlab' | 'other'

/** Map a remote URL to GitHub / GitLab / other (self-hosted GitLab when hostname contains `gitlab`). */
export function classifyGitRemoteUrl(url: string): GitProviderFamily {
  const t = url.trim().toLowerCase()
  if (t.startsWith('git@')) {
    const rest = t.slice(4)
    const host = rest.split(':')[0] ?? ''
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
    if (host.includes('gitlab')) return 'gitlab'
    return 'other'
  }
  if (t.startsWith('ssh://')) {
    try {
      const u = new URL(t)
      const h = u.hostname
      if (h === 'github.com' || h.endsWith('.github.com')) return 'github'
      if (h.includes('gitlab')) return 'gitlab'
      return 'other'
    } catch {
      return 'other'
    }
  }
  try {
    const normalized = t.includes('://') ? t : `https://${t}`
    const u = new URL(normalized)
    const h = u.hostname
    if (h === 'github.com' || h.endsWith('.github.com')) return 'github'
    if (h.includes('gitlab')) return 'gitlab'
    return 'other'
  } catch {
    return 'other'
  }
}

export function truncateMiddleUrl(url: string, max = 52): string {
  const s = url.trim()
  if (s.length <= max) return s
  const inner = max - 1
  const left = Math.ceil(inner / 2)
  const right = inner - left
  return `${s.slice(0, left)}…${s.slice(s.length - right)}`
}
