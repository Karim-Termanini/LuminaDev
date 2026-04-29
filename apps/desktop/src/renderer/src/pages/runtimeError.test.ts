import { describe, expect, it } from 'vitest'

import { humanizeRuntimeError } from './runtimeError'

describe('humanizeRuntimeError', () => {
  it('maps stable runtime codes', () => {
    expect(humanizeRuntimeError('[RUNTIME_PERMISSION_DENIED] denied')).toContain('Permission denied')
    expect(humanizeRuntimeError('[RUNTIME_TIMEOUT] timed out')).toContain('timed out')
    expect(humanizeRuntimeError('[RUNTIME_INVALID_VERSION] invalid')).toContain('not available')
  })

  it('falls back to raw text', () => {
    expect(humanizeRuntimeError('plain error')).toBe('plain error')
  })
})
