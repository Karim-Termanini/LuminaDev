import { describe, expect, it } from 'vitest'
import { gitVcsPrTrackingSnapshotForStore, parseGitVcsPrTrackingFromStore } from './gitVcsPrTracking'

describe('parseGitVcsPrTrackingFromStore', () => {
  it('migrates legacy single-host payload', () => {
    expect(
      parseGitVcsPrTrackingFromStore({
        url: 'https://github.com/o/r/pull/1',
        reference: 'feat',
        provider: 'github',
      }),
    ).toEqual({
      github: { url: 'https://github.com/o/r/pull/1', reference: 'feat' },
    })
  })

  it('reads dual-host payload', () => {
    expect(
      parseGitVcsPrTrackingFromStore({
        github: { url: 'https://github.com/o/r/pull/1', reference: 'feat' },
        gitlab: { url: 'https://gitlab.com/o/r/-/merge_requests/2', reference: 'feat' },
      }),
    ).toEqual({
      github: { url: 'https://github.com/o/r/pull/1', reference: 'feat' },
      gitlab: { url: 'https://gitlab.com/o/r/-/merge_requests/2', reference: 'feat' },
    })
  })

  it('returns empty for junk', () => {
    expect(parseGitVcsPrTrackingFromStore(null)).toEqual({})
    expect(parseGitVcsPrTrackingFromStore({})).toEqual({})
  })
})

describe('gitVcsPrTrackingSnapshotForStore', () => {
  it('returns null when empty', () => {
    expect(gitVcsPrTrackingSnapshotForStore({})).toBeNull()
  })
})
