import { describe, expect, it } from 'vitest'

import { humanizeDockerError } from './dockerError'
import {
  SSH_FLATPAK_HINT,
  TERMINAL_OPEN_EXTERNAL_HINT,
  TERMINAL_PTY_HINT,
} from './environmentHints'

describe('critical user-facing scenarios (e2e-lite)', () => {
  it('docker action failure maps to actionable message', () => {
    const msg = humanizeDockerError('[DOCKER_UNAVAILABLE] daemon socket not reachable')
    expect(msg).toContain('Docker daemon/socket unavailable')
  })

  it('ssh page contains flatpak permission guidance', () => {
    expect(SSH_FLATPAK_HINT).toContain('flatpak override --user --filesystem=~/.ssh')
  })

  it('terminal fallback guidance is explicit', () => {
    expect(TERMINAL_PTY_HINT).toContain('node-pty')
    expect(TERMINAL_OPEN_EXTERNAL_HINT).toContain('Open external terminal')
  })
})
