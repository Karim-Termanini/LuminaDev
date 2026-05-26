/**
 * Profile error humanization — convert error codes to user-friendly messages.
 */

export function humanizeProfileError(raw: string): string {
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  const code = match?.[1] ?? ''
  const detail = (match?.[2] ?? '').trim()

  const messages: Record<string, string> = {
    PROFILE_SWITCH_INVALID: 'Invalid profile switch request. Check profile name.',
    PROFILE_SWITCH_FAILED: 'Could not switch profiles. Check Docker daemon and profile configuration.',
    DOCKER_UNAVAILABLE: 'Docker is not running. Start Docker and try again.',
    PROFILE_CRED_INVALID: 'Invalid credential. ID and value required.',
    PROFILE_CRED_STORE_READ: 'Could not read credentials. Storage may be corrupted.',
    PROFILE_CRED_STORE_DECRYPT: 'Could not decrypt credentials. Storage may be corrupted or inaccessible.',
    PROFILE_CRED_STORE_PARSE: 'Could not parse credentials. Storage format is invalid.',
    PROFILE_CRED_STORE_ENCODE: 'Could not encode credential for storage.',
    PROFILE_CRED_STORE_ENCRYPT: 'Could not encrypt credential. Storage error.',
    PROFILE_CRED_STORE_DIR: 'Could not create credential storage directory.',
    PROFILE_CRED_STORE_WRITE: 'Could not write credentials to storage.',
  }

  const base = messages[code]
  if (base) return detail ? `${base} (${detail})` : base
  return raw || 'Profile operation failed.'
}
