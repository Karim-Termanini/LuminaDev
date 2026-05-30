import { classifyGitRemoteUrl } from './gitVcsProviderHost'

/** HTTPS repo page on GitHub (null for GitLab/other or unparseable remotes). */
export function githubRepoWebUrl(remoteUrl: string): string | null {
  if (classifyGitRemoteUrl(remoteUrl) !== 'github') return null
  const raw = remoteUrl.trim()
  let host = 'github.com'
  let path = ''

  if (raw.startsWith('git@')) {
    const rest = raw.slice(4)
    const colon = rest.indexOf(':')
    if (colon < 0) return null
    host = rest.slice(0, colon)
    path = rest.slice(colon + 1)
  } else {
    try {
      const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
      host = u.hostname
      path = u.pathname.replace(/^\//, '')
    } catch {
      return null
    }
  }

  if (host !== 'github.com' && !host.endsWith('.github.com')) return null
  path = path.replace(/\.git$/i, '').replace(/\/$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1]
  return `https://${host}/${owner}/${repo}`
}
