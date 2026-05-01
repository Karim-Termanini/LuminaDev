export function humanizeRuntimeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code === 'RUNTIME_PERMISSION_DENIED') return `Permission denied. Root/sudo is required for system installs. ${detail}`
  if (code === 'RUNTIME_NOT_FOUND') return `Tools or directories not found. Check your environment. ${detail}`
  if (code === 'RUNTIME_TIMEOUT') return `Installation timed out. Check your network. ${detail}`
  if (code === 'RUNTIME_NO_SPACE') return `No space left on device. ${detail}`
  if (code === 'RUNTIME_INVALID_VERSION') return `The requested version is not available. ${detail}`
  if (code === 'RUNTIME_DEP_FAIL') return `Failed to install required system dependencies. ${detail}`
  if (code === 'RUNTIME_SET_ACTIVE_FAILED') return `Could not switch the active toolchain. ${detail}`
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }

  return detail || 'Runtime operation failed.'
}
