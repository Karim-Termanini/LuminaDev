import { describe, expect, it } from 'vitest'

import { assertTerminalOk } from './terminalContract'

describe('assertTerminalOk', () => {
  it('accepts success payload', () => {
    expect(() => assertTerminalOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit terminal error', () => {
    expect(() => assertTerminalOk({ ok: false, error: '[TERMINAL_NOT_FOUND] missing' })).toThrow(
      '[TERMINAL_NOT_FOUND] missing'
    )
  })
})
