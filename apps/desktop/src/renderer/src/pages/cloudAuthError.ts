/** True when the backend reports placeholder / missing OAuth client IDs (not a user mistake). */
export function isCloudAuthOauthNotConfigured(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.includes('[CLOUD_AUTH_OAUTH_NOT_CONFIGURED]')
}

export function humanizeCloudAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? raw).trim()
  if (code === 'CLOUD_AUTH_INVALID_TOKEN') {
    const head = (detail || 'Token is invalid or expired').trim().replace(/\s*\.\s*$/, '')
    const sentence = head.endsWith('.') ? head : `${head}.`
    return `${sentence} Reconnect in Cloud Git under Account & security with a new token.`.trim()
  }
  if (code === 'CLOUD_AUTH_NOT_CONNECTED') {
    return (detail || 'Connect this provider in Cloud Git first.').trim()
  }
  if (code === 'CLOUD_AUTH_OAUTH_NOT_CONFIGURED') {
    return `${detail || 'Device sign-in is not configured for this build.'}`.trim()
  }
  if (code === 'CLOUD_AUTH_DEVICE_START_REJECTED') {
    return `The provider refused device sign-in (this is usually a bad or missing OAuth client ID, or the app is not allowed to use the device flow). ${detail}`.trim()
  }
  if (code === 'CLOUD_AUTH_DEVICE_FLOW_DISABLED') {
    return (detail || 'Use a personal access token on the Cloud Git page instead.').trim()
  }
  if (code === 'CLOUD_AUTH_DEVICE_POLL_REJECTED') {
    return (
      detail ||
      'GitHub rejected the token step after browser authorization. Register a Device-flow OAuth app Client ID under Cloud Git → Advanced, or connect with a PAT.'
    ).trim()
  }
  if (code === 'CLOUD_AUTH_NETWORK') {
    return `Could not reach the provider. Check your connection and try again. ${detail}`.trim()
  }
  if (code.startsWith('CLOUD_AUTH_STORE')) {
    return `Could not read or save cloud account credentials on this machine. ${detail}`.trim()
  }
  if (code === 'CLOUD_GIT_SCOPE') {
    return `${detail || 'Could not scope CI to this repository.'}`.trim()
  }
  if (code === 'CLOUD_GIT_INSUFFICIENT_SCOPE') {
    return (detail || 'Your token lacks the required scope for this operation. Reconnect with a token that has the necessary permissions.').trim()
  }
  if (code === 'CLOUD_GIT_CREATE_PR') {
    return (detail || 'Could not create the pull or merge request.').trim()
  }
  if (code === 'CLOUD_GIT_MERGE_PR') {
    return (detail || 'Could not merge this pull or merge request on the server.').trim()
  }
  if (code === 'CLOUD_GIT_NETWORK') {
    return `The provider API request failed. ${detail || 'Try again in a moment.'}`.trim()
  }
  if (code === 'CLOUD_GIT_MR_BRANCH_NOT_ON_REMOTE') {
    return (
      detail ||
      'This branch is not on the remote yet. Push it to that remote first, then open the merge or pull request again.'
    ).trim()
  }
  if (code === 'CLOUD_GIT_PR_EXISTS') {
    return (detail || 'A pull or merge request for this branch already exists on the host.').trim()
  }
  if (code === 'CLOUD_GIT_PERMISSION_DENIED') {
    return (detail || 'The host denied this action for your account or token.').trim()
  }
  return detail || 'Cloud operation failed.'
}
