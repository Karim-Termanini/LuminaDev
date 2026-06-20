/** GitHub rejected SSH: local key exists but is not registered on the account. */
export function isGithubPublicKeyDenied(output: string): boolean {
  const lower = output.toLowerCase()
  return lower.includes('permission denied (publickey)') || lower.includes('permission denied (public key)')
}

export const GITHUB_SSH_KEYS_URL = 'https://github.com/settings/ssh/new'
