import type { StoreDeleteRequest, StoreGetRequest, StoreSetRequest } from './schemas.js'

/** Per-profile dynamic store keys (validated by `StoreDynamicKeySchema` on the IPC boundary). */
export type ProfileScopedStoreKey =
  | `project_dir_${string}`
  | `python_version_${string}`
  | `postgres_version_${string}`
  | `node_version_${string}`

export type ProfileScopedStoreField = 'project_dir' | 'python_version' | 'postgres_version' | 'node_version'

export function profileStoreKey(
  field: ProfileScopedStoreField,
  profileName: string
): ProfileScopedStoreKey {
  return `${field}_${profileName}`
}

export function profileStoreGetRequest(
  field: ProfileScopedStoreField,
  profileName: string
): StoreGetRequest {
  return { key: profileStoreKey(field, profileName) }
}

export function profileStoreSetRequest(
  field: ProfileScopedStoreField,
  profileName: string,
  data: unknown
): StoreSetRequest {
  return { key: profileStoreKey(field, profileName), data }
}

export function profileStoreDeleteRequest(
  field: ProfileScopedStoreField,
  profileName: string
): StoreDeleteRequest {
  return { key: profileStoreKey(field, profileName) }
}
