function extractPort(text: string): string | null {
  const patterns = [/0\.0\.0\.0:(\d{1,5})/, /\[::\]:(\d{1,5})/, /:(\d{1,5})\s+failed/i, /port\s+(\d{1,5})\b/i]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function humanizeDockerDetail(text: string): string | null {
  const lower = text.toLowerCase()

  if (/port is already allocated|address already in use|bind: address already in use/i.test(text)) {
    const port = extractPort(text)
    if (port) {
      return `Port ${port} is already in use by another program. Stop that program first, or choose a different port.`
    }
    return 'A port is already in use by another program. Stop that program first, or choose a different port.'
  }

  if (/container name.*already in use|name .* is already in use/i.test(text)) {
    return 'A container with this name already exists. Remove the old one first, or use a different name.'
  }

  if (
    /cannot connect to the docker daemon|docker daemon is not reachable|is the docker daemon running|docker daemon\/socket unavailable|error during connect|no such file or directory.*docker\.sock/i.test(
      text
    )
  ) {
    return 'Docker is not running. Start Docker first, then try again.'
  }

  if (/permission denied|eacces/i.test(lower) && /docker|\/var\/run\/docker\.sock|daemon/i.test(lower)) {
    return "You don't have permission to access Docker. Run `sudo usermod -aG docker $USER` and log out/in."
  }

  if (/^permission denied$/i.test(lower.trim())) {
    return "You don't have permission to access Docker. Run `sudo usermod -aG docker $USER` and log out/in."
  }

  if (/no such image|image not found|repository does not exist|manifest unknown|pull access denied.*does not exist/i.test(text)) {
    return "This image doesn't exist on your system. Pull it first, then try again."
  }

  if (/no such container/i.test(text)) {
    return "This container doesn't exist. It may have been removed already. Refresh the list and try again."
  }

  if (/container is not running|is not running/i.test(text)) {
    return 'This container is stopped. Start it first, then try again.'
  }

  if (/volume is in use|volume.*is being used|unable to remove.*volume|volume .* is in use/i.test(text)) {
    return 'This volume is being used by a running container. Stop the container first, then try again.'
  }

  if (/conflict/i.test(lower) && /already in use/i.test(lower)) {
    return 'A container with this name already exists. Remove the old one first, or use a different name.'
  }

  return null
}

function humanizeDockerCode(code: string, detail: string): string | null {
  const fromDetail = humanizeDockerDetail(detail)
  if (fromDetail) return fromDetail

  if (code === 'DOCKER_UNAVAILABLE') {
    return 'Docker is not running. Start Docker first, then try again.'
  }
  if (code === 'DOCKER_PERMISSION_DENIED') {
    return "You don't have permission to access Docker. Run `sudo usermod -aG docker $USER` and log out/in."
  }
  if (code === 'DOCKER_NOT_FOUND') {
    return "The requested Docker resource was not found. Refresh the list and try again."
  }
  if (code === 'DOCKER_CONFLICT') {
    return 'A container with this name already exists. Remove the old one first, or use a different name.'
  }
  if (code === 'DOCKER_TIMEOUT') return `Docker operation timed out. ${detail}`.trim()
  if (code === 'DOCKER_INVALID_REQUEST') return `Invalid Docker request. ${detail}`.trim()
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }
  if (code === 'DOCKER_INSTALL_NOT_SUPPORTED') {
    return `Automated install is not supported in this environment. ${detail}`.trim()
  }
  if (code === 'DOCKER_REMAP_NOT_SUPPORTED') {
    return `Port remapping is not supported in this environment. ${detail}`.trim()
  }
  if (code === 'DOCKER_INSTALL_FAILED') {
    return `Docker install step failed. ${detail}`.trim()
  }
  if (code === 'DOCKER_REMAP_FAILED') {
    return `Port remap (clone) failed. ${detail}`.trim()
  }
  if (code === 'DOCKER_STATS_FAILED') {
    return `Failed to fetch container stats. ${detail}`.trim()
  }

  return null
}

export function humanizeDockerError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code) {
    const fromCode = humanizeDockerCode(code, detail)
    if (fromCode) return fromCode
  }

  const fromDetail = humanizeDockerDetail(detail) ?? humanizeDockerDetail(raw)
  if (fromDetail) return fromDetail

  return detail || 'Docker operation failed.'
}
