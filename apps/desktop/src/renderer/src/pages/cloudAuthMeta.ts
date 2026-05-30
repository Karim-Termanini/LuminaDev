import type { CloudGitProviderId } from './cloudGitTheme'

export type CloudAuthProviderMeta = {
  label: string
  icon: string
  scopes: string[]
  tabEmoji: string
}

export const CLOUD_AUTH_PROVIDER_META: Record<CloudGitProviderId, CloudAuthProviderMeta> = {
  github: {
    label: 'GitHub',
    icon: 'github',
    scopes: ['repo', 'read:org', 'read:user', 'notifications'],
    tabEmoji: '🐱',
  },
  gitlab: {
    label: 'GitLab',
    icon: 'source-control',
    scopes: ['api', 'read_api', 'read_user', 'read_repository', 'write_repository'],
    tabEmoji: '🦊',
  },
}

export const CLOUD_AUTH_PROVIDERS: readonly CloudGitProviderId[] = ['github', 'gitlab']
