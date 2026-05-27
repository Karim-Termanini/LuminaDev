function translateError(code: string, detail: string, t?: (key: string) => string): string {
  if (!t) return ''

  const keyMap: Record<string, string> = {
    SSH_AUTH_FAILED: 'error.authFailed',
    SSH_HOST_KEY_FAIL: 'error.hostKeyFail',
    SSH_TIMEOUT: 'error.timeout',
    SSH_REFUSED: 'error.refused',
    SSH_FILE_NOT_FOUND: 'error.fileNotFound',
    SSH_TOOL_MISSING: 'error.toolMissing',
    SSH_NO_KEY: 'error.noKey',
    SSH_ENABLE_LOCAL_FAILED: 'error.enableLocalFailed',
    HOST_COMMAND_TIMEOUT: 'error.hostCommandTimeout',
  }

  const key = keyMap[code]
  if (!key) return ''

  const base = t(key)
  return detail ? `${base} ${detail}` : base
}

export function humanizeSshError(err: unknown, t?: (key: string) => string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  const localized = translateError(code, detail, t)
  if (localized) return localized

  if (code === 'SSH_AUTH_FAILED') return `Authentication failed. Check your keys or password. ${detail}`
  if (code === 'SSH_HOST_KEY_FAIL') return `Host key verification failed. The server identity changed or is unknown.`
  if (code === 'SSH_TIMEOUT') return `Connection timed out. Ensure the server is reachable.`
  if (code === 'SSH_REFUSED') return `Connection refused. Is SSH running on the remote host?`
  if (code === 'SSH_FILE_NOT_FOUND') return `Local file or SSH identity not found.`
  if (code === 'SSH_TOOL_MISSING') return `SSH tools are missing on your host system.`
  if (code === 'SSH_NO_KEY') return `No SSH key found. Please generate one first.`
  if (code === 'SSH_ENABLE_LOCAL_FAILED') return `Could not enable SSH daemon. ${detail}`
  if (code === 'HOST_COMMAND_TIMEOUT') {
    return `A host command took too long and was stopped. ${detail}`.trim()
  }

  return detail || 'SSH operation failed.'
}
