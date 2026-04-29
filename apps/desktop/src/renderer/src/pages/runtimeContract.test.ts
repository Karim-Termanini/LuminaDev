import { describe, expect, it } from 'vitest'

import { assertRuntimeOk } from './runtimeContract'

describe('assertRuntimeOk', () => {
  it('accepts success payload', () => {
    expect(() => assertRuntimeOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit runtime error', () => {
    expect(() => assertRuntimeOk({ ok: false, error: '[RUNTIME_TIMEOUT] timeout' })).toThrow(
      '[RUNTIME_TIMEOUT] timeout'
    )
  })

  it('throws on malformed payload', () => {
    expect(() => assertRuntimeOk('bad', 'Custom fallback')).toThrow('Custom fallback (invalid response payload)')
  })
})
