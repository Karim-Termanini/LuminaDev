export function dockerErrorString(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()
  if (/permission denied|eacces|operation not permitted/.test(m)) return `[DOCKER_PERMISSION_DENIED] ${raw}`
  if (/no such container|not found|no such image|no such volume|no such network/.test(m)) return `[DOCKER_NOT_FOUND] ${raw}`
  if (/conflict|already in use|already exists|is in use/.test(m)) return `[DOCKER_CONFLICT] ${raw}`
  if (/timeout|timed out|etimedout/.test(m)) return `[DOCKER_TIMEOUT] ${raw}`
  if (/socket|cannot connect|docker unavailable|is the docker daemon running/.test(m)) {
    return `[DOCKER_UNAVAILABLE] ${raw || fallback}`
  }
  return `[DOCKER_UNKNOWN] ${raw || fallback}`
}
