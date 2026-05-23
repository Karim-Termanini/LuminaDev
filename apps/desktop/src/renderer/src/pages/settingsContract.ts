/**
 * Settings contract helpers — validate IPC responses for store operations.
 */

export type SettingsResult = { ok: boolean; error?: string; data?: unknown }

/**
 * Assert that a store operation succeeded. Throws with user-friendly error if not.
 */
export function assertSettingsOk(result: unknown, fallback = 'Settings operation failed'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as SettingsResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
