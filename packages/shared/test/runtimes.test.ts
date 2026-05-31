import { describe, expect, it } from 'vitest'

import {
  RUNTIME_IDS,
  runtimeIsSystemOnly,
  runtimeSupportsLocalInstall,
} from '../src/runtimes.js'

describe('runtime catalog', () => {
  it('lists exactly seven supported runtimes', () => {
    expect(RUNTIME_IDS).toHaveLength(7)
    expect(RUNTIME_IDS).toEqual([
      'node',
      'python',
      'java',
      'go',
      'rust',
      'php',
      'dotnet',
    ])
  })
})

describe('runtime install method policy', () => {
  it('allows local install for versioned / user-scope toolchains', () => {
    for (const id of ['node', 'python', 'go', 'rust', 'java', 'dotnet']) {
      expect(runtimeSupportsLocalInstall(id)).toBe(true)
      expect(runtimeIsSystemOnly(id)).toBe(false)
    }
  })

  it('forces system install for distro-only runtimes', () => {
    for (const id of ['php']) {
      expect(runtimeSupportsLocalInstall(id)).toBe(false)
      expect(runtimeIsSystemOnly(id)).toBe(true)
    }
  })
})
