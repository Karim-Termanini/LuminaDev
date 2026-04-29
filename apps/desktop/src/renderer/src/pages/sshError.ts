export function humanizeSshError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()

  if (code === 'SSH_AUTH_FAILED') return `Authentication failed. Check your keys or password. ${detail}`
  if (code === 'SSH_HOST_KEY_FAIL') return `Host key verification failed. The server identity changed or is unknown.`
  if (code === 'SSH_TIMEOUT') return `Connection timed out. Ensure the server is reachable.`
  if (code === 'SSH_REFUSED') return `Connection refused. Is SSH running on the remote host?`
  if (code === 'SSH_FILE_NOT_FOUND') return `Local file or SSH identity not found.`
  if (code === 'SSH_TOOL_MISSING') return `SSH tools are missing on your host system.`
  if (code === 'SSH_NO_KEY') return `No SSH key found. Please generate one first.`

  return detail || 'SSH operation failed.'
}
