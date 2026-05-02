/** Cloud Git Activity tab: `github` | `gitlab`. */
export type CloudGitActivityProvider = 'github' | 'gitlab'

/**
 * Best-effort URL to the provider merge UI for a PR/MR (`…/pull/N/merge`, `…/-/merge_requests/N/merge`).
 * Returns null when the URL does not match expected patterns (query/hash stripped first).
 */
export function cloudGitMergeViewUrl(provider: CloudGitActivityProvider, prUrl: string): string | null {
  const raw = prUrl.trim()
  if (!raw) return null
  const u = raw.split(/[?#]/)[0]?.replace(/\/$/, '') ?? ''
  if (!u) return null

  if (provider === 'github') {
    const m = u.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/\d+)/i)
    if (!m) return null
    const base = m[1].replace(/\/merge$/i, '')
    return `${base}/merge`
  }

  const marker = '/-/merge_requests/'
  const i = u.indexOf(marker)
  if (i === -1) return null
  const after = u.slice(i + marker.length)
  const idM = /^(\d+)/.exec(after)
  if (!idM) return null
  const prefix = u.slice(0, i + marker.length + idM[1].length).replace(/\/merge$/i, '')
  if (/\/merge$/i.test(prefix)) return prefix
  return `${prefix}/merge`
}
