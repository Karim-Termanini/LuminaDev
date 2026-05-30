import type { CustomProfileEntry } from '@linux-dev-home/shared'

export function sshKeySlugFromProfileName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
  return slug || 'profile'
}

export function baseSshKeyNameForProfile(profileName: string): string {
  return `id_ed25519_${sshKeySlugFromProfileName(profileName)}`
}

export function findSshKeyConflict(
  profiles: CustomProfileEntry[],
  sshKeyId: string | undefined,
  editingProfileIdx: number | null
): CustomProfileEntry | undefined {
  if (!sshKeyId?.trim()) return undefined
  return profiles.find((p, idx) => p.sshKeyId === sshKeyId && idx !== editingProfileIdx)
}

/** Picks a key filename not already assigned to another profile. */
export function suggestUniqueSshKeyName(
  profiles: CustomProfileEntry[],
  profileName: string,
  editingProfileIdx: number | null
): string {
  const base = baseSshKeyNameForProfile(profileName)
  const used = new Set(
    profiles
      .filter((_, idx) => idx !== editingProfileIdx)
      .map((p) => p.sshKeyId)
      .filter((id): id is string => Boolean(id?.trim()))
  )
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  return candidate
}
