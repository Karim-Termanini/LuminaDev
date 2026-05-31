import { describe, expect, it } from 'vitest'

import {
  buildIncludedFromPaths,
  deserializeExclusionMap,
  serializeExclusionMap,
  setPathIncluded,
  setPathsIncluded,
  stagedPathsToUnstageBeforeCommit,
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

  it('supports bulk exclude via setPathsIncluded', () => {
    const map: BranchExclusionMap = new Map()
    const paths = ['a.ts', 'b.ts', 'c.ts']
    setPathsIncluded(map, 'main', paths, false)
    expect(buildIncludedFromPaths(paths, 'main', map).size).toBe(0)
  })

  it('round-trips exclusion map serialization', () => {
    const map: BranchExclusionMap = new Map([
      ['main', new Set(['a.ts', 'b.ts'])],
      ['feature', new Set(['c.ts'])],
    ])
    const restored = deserializeExclusionMap(serializeExclusionMap(map))
    expect(buildIncludedFromPaths(['a.ts', 'b.ts', 'c.ts'], 'main', restored).has('a.ts')).toBe(false)
    expect(buildIncludedFromPaths(['a.ts', 'b.ts', 'c.ts'], 'feature', restored).has('c.ts')).toBe(
      false,
    )
  })

  it('lists staged paths to unstage when user excluded them', () => {
    const staged = [
      { path: 'keep.ts', status: 'M' },
      { path: 'drop.ts', status: 'A' },
      { path: 'conflict.ts', status: 'C' },
    ]
    const excluded = new Set(['drop.ts', 'conflict.ts'])
    expect(stagedPathsToUnstageBeforeCommit(staged, excluded)).toEqual(['drop.ts'])
  })
})
