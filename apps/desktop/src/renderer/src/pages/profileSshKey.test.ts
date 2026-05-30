import { describe, expect, it } from 'vitest'

import type { CustomProfileEntry } from '@linux-dev-home/shared'

import {
  baseSshKeyNameForProfile,
  findSshKeyConflict,
  suggestUniqueSshKeyName,
} from './profileSshKey'

const profile = (name: string, sshKeyId?: string): CustomProfileEntry => ({
  name,
  baseTemplate: 'data-science',
  description: '',
  tags: [],
  composeVariant: 'stub',
  envVars: [],
  sshKeyId,
  credentialIds: [],
})

describe('profileSshKey', () => {
  it('detects duplicate sshKeyId across profiles', () => {
    const profiles = [profile('testing11', 'host'), profile('datasci')]
    expect(findSshKeyConflict(profiles, 'host', 1)?.name).toBe('testing11')
    expect(findSshKeyConflict(profiles, 'host', 0)).toBeUndefined()
  })

  it('suggests profile-scoped key name when host is taken', () => {
    const profiles = [profile('testing11', 'host')]
    expect(suggestUniqueSshKeyName(profiles, 'My Data Sci', null)).toBe(
      'id_ed25519_my_data_sci'
    )
  })

  it('increments suffix when suggested name is already assigned', () => {
    const profiles = [
      profile('testing11', 'host'),
      profile('other', 'id_ed25519_my_data_sci'),
    ]
    expect(suggestUniqueSshKeyName(profiles, 'My Data Sci', null)).toBe(
      'id_ed25519_my_data_sci_2'
    )
  })

  it('builds stable base key name from profile name', () => {
    expect(baseSshKeyNameForProfile('Data-Science 2')).toBe('id_ed25519_data_science_2')
  })
})
