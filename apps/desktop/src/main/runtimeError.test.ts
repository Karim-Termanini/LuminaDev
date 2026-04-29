import { describe, expect, it } from 'vitest'

import { runtimeErrorString } from './runtimeError'

describe('runtimeErrorString', () => {
  it('maps permission failures', () => {
    expect(runtimeErrorString(new Error('permission denied writing /usr/bin'), 'fallback')).toMatch(
      /^\[RUNTIME_PERMISSION_DENIED\]/
    )
  })

  it('maps timeout failures', () => {
    expect(runtimeErrorString(new Error('operation timed out'), 'fallback')).toMatch(/^\[RUNTIME_TIMEOUT\]/)
  })

  it('falls back to unknown code', () => {
    expect(runtimeErrorString(new Error('weird runtime failure'), 'fallback')).toMatch(/^\[RUNTIME_UNKNOWN\]/)
  })
})
