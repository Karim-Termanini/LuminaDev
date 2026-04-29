import { describe, expect, it } from 'vitest'

import { humanizeTerminalError } from './terminalError'

describe('humanizeTerminalError', () => {
  it('maps stable terminal codes to user-safe messages', () => {
    expect(humanizeTerminalError('[TERMINAL_NOT_FOUND] missing')).toContain('No compatible terminal binary')
    expect(humanizeTerminalError('[TERMINAL_PTY_UNAVAILABLE] pty failed')).toContain('Embedded PTY is unavailable')
  })

  it('falls back to raw detail', () => {
    expect(humanizeTerminalError('plain error')).toBe('plain error')
  })
})
