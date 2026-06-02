import { describe, expect, it } from 'vitest'

import { humanizeDockerError } from './dockerError'

describe('critical error humanization scenarios', () => {
  it('docker action failure maps to actionable message', () => {
    const msg = humanizeDockerError('[DOCKER_UNAVAILABLE] daemon socket not reachable')
    expect(msg).toContain('Docker is not running')
  })

  it('docker install not supported message is explicit', () => {
    const msg = humanizeDockerError('[DOCKER_INSTALL_NOT_SUPPORTED] use manual install')
    expect(msg).toContain('not supported in this environment')
  })
})
