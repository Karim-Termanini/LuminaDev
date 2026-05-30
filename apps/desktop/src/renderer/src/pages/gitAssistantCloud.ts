import type { CloudGitProviderId } from './cloudGitTheme'
import type { GitProviderFamily } from './gitVcsProviderHost'

type AccountRef = { provider: string }

/** GitHub or GitLab connected in Settings → Connected accounts. */
export function hasCloudGitConnected(accounts: AccountRef[]): boolean {
  return accounts.some((a) => a.provider === 'github' || a.provider === 'gitlab')
}

/** Prefer remote host when connected; otherwise first linked cloud account. */
export function preferredCloudProvider(
  accounts: AccountRef[],
  remoteHost: GitProviderFamily | null,
): CloudGitProviderId | null {
  const has = (p: CloudGitProviderId) => accounts.some((a) => a.provider === p)
  if (remoteHost === 'gitlab' && has('gitlab')) return 'gitlab'
  if (remoteHost === 'github' && has('github')) return 'github'
  if (has('github')) return 'github'
  if (has('gitlab')) return 'gitlab'
  return null
}

export function cloudProviderLabel(provider: CloudGitProviderId): string {
  return provider === 'gitlab' ? 'GitLab' : 'GitHub'
}
