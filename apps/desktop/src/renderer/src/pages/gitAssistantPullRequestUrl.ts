import type { HostRepoLink } from './gitAssistantRemoteUrl'

export const DEFAULT_PULL_REQUEST_BASE = 'main'

const DEFAULT_BRANCH_NAMES = new Set(['main', 'master', 'develop'])

/** True when the current branch should not be offered as a PR head (merge into default instead). */
export function isDefaultIntegrationBranch(branch: string): boolean {
  const name = branch.trim().toLowerCase()
  return DEFAULT_BRANCH_NAMES.has(name)
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
