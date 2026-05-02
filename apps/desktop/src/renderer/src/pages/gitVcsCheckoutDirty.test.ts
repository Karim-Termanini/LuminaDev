import { describe, expect, it } from 'vitest'
import { parseCheckoutDirtyFileList } from './gitVcsCheckoutDirty'

describe('parseCheckoutDirtyFileList', () => {
  it('parses space-separated paths after our error prefix', () => {
    const raw =
      '[GIT_VCS_CHECKOUT_DIRTY] error: Your local changes to the following files would be overwritten by checkout: apps/a.ts apps/b.ts Please commit your changes or stash them before you switch branches. Aborting'
    expect(parseCheckoutDirtyFileList(raw)).toEqual(['apps/a.ts', 'apps/b.ts'])
  })

  it('parses without IPC prefix', () => {
    const raw =
      'error: Your local changes to the following files would be overwritten by checkout: x/y Please commit your changes or stash them before you switch branches.'
    expect(parseCheckoutDirtyFileList(raw)).toEqual(['x/y'])
  })

  it('returns empty when pattern missing', () => {
    expect(parseCheckoutDirtyFileList('something else')).toEqual([])
  })

  it('parses newline-separated tab-indented paths', () => {
    const raw = `[GIT_VCS_CHECKOUT_DIRTY] error: Your local changes to the following files would be overwritten by checkout:
\tapps/a.ts
\tapps/b.ts
Please commit your changes or stash them before you switch branches.`
    expect(parseCheckoutDirtyFileList(raw)).toEqual(['apps/a.ts', 'apps/b.ts'])
  })
})
