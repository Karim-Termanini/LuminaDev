import { describe, expect, it } from 'vitest'

import { runtimeIsSystemOnly, runtimeSupportsLocalInstall } from '../src/runtimes.js'

describe('runtime install method policy', () => {
  it('allows local install for versioned / user-scope toolchains', () => {
    for (const id of ['node', 'python', 'go', 'rust', 'java', 'dotnet', 'ruby', 'lua', 'r']) {
      expect(runtimeSupportsLocalInstall(id)).toBe(true)
      expect(runtimeIsSystemOnly(id)).toBe(false)
    }
  })

  it('forces system install for distro-only runtimes', () => {
    for (const id of ['lisp', 'c_cpp', 'matlab', 'php']) {
      expect(runtimeSupportsLocalInstall(id)).toBe(false)
      expect(runtimeIsSystemOnly(id)).toBe(true)
    }
  })
})
