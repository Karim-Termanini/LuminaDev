/** Compose auto-mount (`…/<profile>/default`) — not a user-linked workspace. */
export function isAutoComposeMountPath(path: string, profileName: string): boolean {
  const normalized = path.trim().replace(/\/+$/, '')
  const profile = profileName.trim()
  if (!profile) return false
  return normalized.endsWith(`/${profile}/default`)
}

export function isUserLinkedWorkspacePath(
  path: string | null | undefined,
  profileName: string
): path is string {
  return typeof path === 'string' && path.trim().length > 0 && !isAutoComposeMountPath(path, profileName)
}
