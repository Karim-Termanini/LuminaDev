import { describe, expect, it } from 'vitest'

import { terminalErrorString } from './terminalError'

describe('terminalErrorString', () => {
  it('maps permission errors', () => {
    expect(terminalErrorString(new Error('permission denied'), 'fallback')).toMatch(/^\[TERMINAL_PERMISSION_DENIED\]/)
  })

  it('maps missing command errors', () => {
    expect(terminalErrorString(new Error('ENOENT: command not found'), 'fallback')).toMatch(/^\[TERMINAL_NOT_FOUND\]/)
  })

  it('falls back to unknown', () => {
    expect(terminalErrorString(new Error('weird failure'), 'fallback')).toMatch(/^\[TERMINAL_UNKNOWN\]/)
  })
})
