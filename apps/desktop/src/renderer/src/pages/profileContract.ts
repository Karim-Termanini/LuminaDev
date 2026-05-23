/**
 * Profile contract helpers — validate IPC responses for profile operations.
 */

export type ProfileSwitchResult = { ok: boolean; error?: string; log?: string }
export type ProfileCredentialResult = { ok: boolean; error?: string; ids?: string[] }

/**
 * Assert that a profile operation succeeded. Throws with user-friendly error if not.
 */
export function assertProfileSwitchOk(result: unknown, fallback = 'Profile switch failed'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as ProfileSwitchResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}

/**
 * Assert that a profile credential operation succeeded. Throws with user-friendly error if not.
 */
export function assertProfileCredentialOk(result: unknown, fallback = 'Credential operation failed'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as ProfileCredentialResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
