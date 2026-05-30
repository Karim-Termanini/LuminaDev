import { describe, expect, it } from 'vitest'

import {
  buildIncludedFromPaths,
  setPathIncluded,
  type BranchExclusionMap,
} from './gitAssistantFileInclusion'

describe('gitAssistantFileInclusion', () => {
  it('excludes unchecked paths per branch', () => {
    const map: BranchExclusionMap = new Map()
    setPathIncluded(map, 'main', 'a.ts', false)
    const onMain = buildIncludedFromPaths(['a.ts', 'b.ts'], 'main', map)
    expect(onMain.has('a.ts')).toBe(false)
    expect(onMain.has('b.ts')).toBe(true)

    const onFeature = buildIncludedFromPaths(['a.ts', 'b.ts'], 'feature', map)
    expect(onFeature.has('a.ts')).toBe(true)
  })
})
