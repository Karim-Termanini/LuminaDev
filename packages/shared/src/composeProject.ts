/** Matches Rust `sanitize_compose_project_name` / compose `-p` project names. */
export function sanitizeComposeProjectName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed
    .toLowerCase()
    .split('')
    .map((c) => (/[a-z0-9_-]/.test(c) ? c : '-'))
    .join('')
}

/** True when a `docker ps` container name belongs to a compose project (not a substring). */
export function containerBelongsToComposeProject(
  containerName: string,
  profileName: string
): boolean {
  const project = sanitizeComposeProjectName(profileName)
  if (!project) return false
  const normalized = containerName.trim().toLowerCase().replace(/^\//, '')
  return normalized.startsWith(`${project}-`)
}

export function isContainerRunningState(state: string): boolean {
  const s = state.toLowerCase()
  return s.includes('running') || s.includes('up')
}
