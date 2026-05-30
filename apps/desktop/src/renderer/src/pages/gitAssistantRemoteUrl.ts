import type { CloudGitProviderId } from './cloudGitTheme'
import { classifyGitRemoteUrl } from './gitVcsProviderHost'

export type HostRepoLink = { provider: CloudGitProviderId; repoUrl: string }

function parseRemotePath(remoteUrl: string): { host: string; path: string } | null {
  const raw = remoteUrl.trim()
  if (raw.startsWith('git@')) {
    const rest = raw.slice(4)
    const colon = rest.indexOf(':')
    if (colon < 0) return null
    return { host: rest.slice(0, colon), path: rest.slice(colon + 1) }
  }
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return { host: u.hostname, path: u.pathname.replace(/^\//, '') }
  } catch {
    return null
  }
}

/** HTTPS repo page on GitHub (null for GitLab/other or unparseable remotes). */
export function githubRepoWebUrl(remoteUrl: string): string | null {
  if (classifyGitRemoteUrl(remoteUrl) !== 'github') return null
  const parsed = parseRemotePath(remoteUrl)
  if (!parsed) return null
  const { host, path: rawPath } = parsed
  if (host !== 'github.com' && !host.endsWith('.github.com')) return null
  const path = rawPath.replace(/\.git$/i, '').replace(/\/$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return `https://${host}/${parts[0]}/${parts[1]}`
}

/** HTTPS repo page on GitLab.com / self-hosted GitLab (null for GitHub/other). */
export function gitlabRepoWebUrl(remoteUrl: string): string | null {
  if (classifyGitRemoteUrl(remoteUrl) !== 'gitlab') return null
  const parsed = parseRemotePath(remoteUrl)
  if (!parsed) return null
  const { host, path: rawPath } = parsed
  if (!host.includes('gitlab')) return null
  const path = rawPath.replace(/\.git$/i, '').replace(/\/$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const project = parts.join('/')
  return `https://${host}/${project}`
}

export function hostRepoWebLink(remoteUrl: string): HostRepoLink | null {
  const family = classifyGitRemoteUrl(remoteUrl)
  if (family === 'github') {
    const repoUrl = githubRepoWebUrl(remoteUrl)
    return repoUrl ? { provider: 'github', repoUrl } : null
  }
  if (family === 'gitlab') {
    const repoUrl = gitlabRepoWebUrl(remoteUrl)
    return repoUrl ? { provider: 'gitlab', repoUrl } : null
  }
  return null
}

export function branchWebUrl(link: HostRepoLink, branch: string): string {
  const b = branch.trim()
  if (!b) return link.repoUrl
  if (link.provider === 'gitlab') {
    return `${link.repoUrl}/-/tree/${encodeURIComponent(b)}`
  }
  return `${link.repoUrl}/tree/${encodeURIComponent(b)}`
}
