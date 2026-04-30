export function humanizeDockerError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'DOCKER_PERMISSION_DENIED') return `Docker permission denied. ${detail}`
  if (code === 'DOCKER_UNAVAILABLE') return `Docker daemon/socket unavailable. ${detail}`
  if (code === 'DOCKER_NOT_FOUND') return `Requested Docker resource not found. ${detail}`
  if (code === 'DOCKER_CONFLICT') return `Docker conflict. ${detail}`
  if (code === 'DOCKER_TIMEOUT') return `Docker operation timed out. ${detail}`
  if (code === 'DOCKER_INVALID_REQUEST') return `Invalid Docker request. ${detail}`
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }
  if (code === 'DOCKER_INSTALL_NOT_SUPPORTED') {
    return `Automated install is not available in this build (likely Flatpak). ${detail}`.trim()
  }
  if (code === 'DOCKER_REMAP_NOT_SUPPORTED') {
    return `Port remapping is not supported in this build (likely Flatpak). ${detail}`.trim()
  }
  if (code === 'DOCKER_INSTALL_FAILED') {
    return `Docker install step failed. ${detail}`.trim()
  }
  if (code === 'DOCKER_REMAP_FAILED') {
    return `Port remap (clone) failed. ${detail}`.trim()
  }
  return detail || 'Docker operation failed.'
}
