export type CloudGitProviderId = 'github' | 'gitlab'

/** Scoped palette for Cloud Git (does not replace global app `--accent`). */
export const CLOUD_GIT_PROVIDER_THEME: Record<
  CloudGitProviderId,
  { accent: string; accentMuted: string; surface: string; surfaceDeep: string; label: string }
> = {
  github: {
    accent: '#58a6ff',
    accentMuted: 'rgba(88, 166, 255, 0.35)',
    surface: 'rgba(88, 166, 255, 0.1)',
    surfaceDeep: 'rgba(88, 166, 255, 0.06)',
    label: 'GitHub',
  },
  gitlab: {
    accent: '#fc6d26',
    accentMuted: 'rgba(252, 109, 38, 0.4)',
    surface: 'rgba(172, 119, 255, 0.12)',
    surfaceDeep: 'rgba(252, 109, 38, 0.07)',
    label: 'GitLab',
  },
}
