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
    return `Token is invalid or expired. Double-check the token and try again. ${detail}`.trim()
  }
  if (code === 'CLOUD_AUTH_OAUTH_NOT_CONFIGURED') {
    return `${detail || 'Device sign-in is not configured for this build.'}`.trim()
  }
  if (code === 'CLOUD_AUTH_DEVICE_START_REJECTED') {
    return `The provider refused device sign-in (this is usually a bad or missing OAuth client ID, or the app is not allowed to use the device flow). ${detail}`.trim()
  }
  if (code === 'CLOUD_AUTH_NETWORK') {
    return `Could not reach the provider. Check your connection and try again. ${detail}`.trim()
  }
  if (code.startsWith('CLOUD_AUTH_STORE')) {
    return `Could not read or save cloud account credentials on this machine. ${detail}`.trim()
  }
  return detail || 'Cloud auth operation failed.'
}
