import { describe, expect, it } from 'vitest'

import { diffSortedSets, readDhMethodNamesFromBridge, readDhMethodNamesFromViteEnv } from './dhApiParity'

describe('desktopApiBridge contract', () => {
  it('keeps window.dh declaration in sync with createTauriDhApi()', () => {
    const declared = readDhMethodNamesFromViteEnv()
    const implemented = readDhMethodNamesFromBridge()
    const { onlyA, onlyB } = diffSortedSets(declared, implemented)

    expect(
      onlyA,
      `vite-env.d.ts declares window.dh methods missing from desktopApiBridge: ${onlyA.join(', ')}`,
    ).toEqual([])
    expect(
      onlyB,
      `desktopApiBridge implements methods missing from vite-env.d.ts: ${onlyB.join(', ')}`,
    ).toEqual([])
    expect(declared.length).toBeGreaterThan(50)
    expect(implemented.length).toBe(declared.length)
  })
})
