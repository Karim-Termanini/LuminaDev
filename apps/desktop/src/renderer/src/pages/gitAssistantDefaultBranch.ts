import { DEFAULT_PULL_REQUEST_BASE } from './gitAssistantPullRequestUrl'

/** Best-effort default integration branch for PR base (main vs master). */
export function guessDefaultBaseBranch(branchNames: string[]): string {
  const lower = new Set(branchNames.map((n) => n.trim().toLowerCase()).filter(Boolean))
  if (lower.has('main')) return 'main'
  if (lower.has('master')) return 'master'
  return DEFAULT_PULL_REQUEST_BASE
}
