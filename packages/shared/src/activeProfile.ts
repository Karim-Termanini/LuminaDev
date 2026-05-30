import { ComposeProfileSchema, parseStoredActiveProfile, type ComposeProfile } from './schemas.js'

export type ActiveProfileRef = Pick<{ name: string; baseTemplate: ComposeProfile }, 'name' | 'baseTemplate'>

/** True when `value` is a built-in compose template id (not a user-named profile). */
export function isComposeProfileTemplate(value: string): value is ComposeProfile {
  return ComposeProfileSchema.safeParse(value).success
}

/**
 * Map a persisted `active_profile` store value to the dashboard/profile name users should see.
 * Template ids from the wizard resolve to a matching custom profile when unambiguous.
 */
export function resolveActiveProfileName(
  stored: string | null,
  customProfiles: ReadonlyArray<ActiveProfileRef>
): string | null {
  if (!stored) return null
  const normalized = parseStoredActiveProfile(stored)
  if (!normalized) return null

  if (customProfiles.some((p) => p.name === normalized)) {
    return normalized
  }

  if (customProfiles.length === 0) {
    return null
  }

  if (isComposeProfileTemplate(normalized)) {
    const matches = customProfiles.filter((p) => p.baseTemplate === normalized)
    if (matches.length === 1) return matches[0]!.name
    const byName = matches.find((p) => p.name === normalized)
    if (byName) return byName.name
    if (matches.length > 1) return matches[0]!.name
  }

  return null
}

/** Whether `stored` should be kept in the store (vs cleared as orphaned). */
export function isStoredActiveProfileValid(
  stored: string | null,
  customProfiles: ReadonlyArray<ActiveProfileRef>
): boolean {
  return resolveActiveProfileName(stored, customProfiles) !== null
}
