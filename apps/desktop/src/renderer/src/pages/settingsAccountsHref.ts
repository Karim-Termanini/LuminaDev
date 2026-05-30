import type { CloudGitProviderId } from './cloudGitTheme'

export function settingsAccountsHref(provider?: CloudGitProviderId): string {
  return provider ? `/settings?tab=accounts&provider=${provider}` : '/settings?tab=accounts'
}
