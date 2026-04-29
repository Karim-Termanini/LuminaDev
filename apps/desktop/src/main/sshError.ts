export function sshErrorString(err: unknown, fallback: string): string {
  let raw = err instanceof Error ? err.message : String(err)
  if (raw === '[object Object]') raw = ''
  const detail = raw || fallback
  const m = detail.toLowerCase()

  if (/permission denied|eacces|publickey|authentication failed/.test(m)) {
    return `[SSH_AUTH_FAILED] Authentication failed. Check your keys or password. (${detail})`
  }
  if (/host key verification failed/.test(m)) {
    return `[SSH_HOST_KEY_FAIL] Host key verification failed. The server's identity has changed or is unknown.`
  }
  if (/timeout|timed out|etimedout/.test(m)) {
    return `[SSH_TIMEOUT] Connection timed out. Ensure the server is reachable and port is open.`
  }
  if (/connection refused|econnrefused/.test(m)) {
    return `[SSH_REFUSED] Connection refused. Is the SSH service running on the remote host?`
  }
  if (/no such file or directory|enoent/.test(m)) {
    return `[SSH_FILE_NOT_FOUND] Local file or SSH identity not found.`
  }
  if (/ssh-keygen: command not found|not recognized/.test(m)) {
    return `[SSH_TOOL_MISSING] SSH tools (ssh-keygen/ssh) are not installed on your host system.`
  }

  return `[SSH_UNKNOWN] ${detail}`
}
