import { describe, expect, it } from 'vitest'
import { fetchRemoteOptions } from './gitVcsFetchRemotes'

describe('fetchRemoteOptions', () => {
  it('returns origin when there are no remote-tracking branches', () => {
    expect(fetchRemoteOptions([])).toEqual(['origin'])
    expect(
      fetchRemoteOptions([{ name: 'main', remote: false, current: true }]),
    ).toEqual(['origin'])
  })

  it('parses remote names from remote branch short names', () => {
    expect(
      fetchRemoteOptions([
        { name: 'gitlab/main', remote: true, current: false },
        { name: 'origin/main', remote: true, current: false },
      ]),
    ).toEqual(['origin', 'gitlab'])
  })

  it('ignores remote entries without a slash', () => {
    expect(
      fetchRemoteOptions([{ name: 'weird', remote: true, current: false }]),
    ).toEqual(['origin'])
  })
})
