import type { HostRepoLink } from './gitAssistantRemoteUrl'

export const DEFAULT_PULL_REQUEST_BASE = 'main'

const INTEGRATION_HEAD_BRANCHES = new Set(['main', 'master'])

/** True when checked out branch is the usual integration target (cannot PR into itself). */
export function isDefaultIntegrationBranch(branch: string): boolean {
  const name = branch.trim().toLowerCase()
  return INTEGRATION_HEAD_BRANCHES.has(name)
}

/** Browser URL to start a new PR/MR (base ← head). */
export function hostNewPullRequestUrl(
  link: HostRepoLink,
  headBranch: string,
  baseBranch = DEFAULT_PULL_REQUEST_BASE,
): string | null {
  const head = headBranch.trim()
  const base = baseBranch.trim()
  if (!head || !base || head === base) return null

  if (link.provider === 'gitlab') {
    const params = new URLSearchParams({
      'merge_request[source_branch]': head,
      'merge_request[target_branch]': base,
    })
    return `${link.repoUrl}/-/merge_requests/new?${params.toString()}`
  }

  const enc = (s: string) => encodeURIComponent(s)
  return `${link.repoUrl}/compare/${enc(base)}...${enc(head)}?expand=1`
}
