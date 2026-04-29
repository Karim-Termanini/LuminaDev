import { describe, expect, it } from 'vitest'

import { assertDockerOk } from './dockerContract'
import { humanizeDockerError } from './dockerError'

function toUserFacingMessage(result: unknown, fallback: string): string {
  try {
    assertDockerOk(result, fallback)
    return ''
  } catch (e) {
    return humanizeDockerError(e)
  }
}

describe('docker IPC contract integration', () => {
  it('humanizes deterministic unavailable action failures', () => {
    const msg = toUserFacingMessage(
      { ok: false, error: '[DOCKER_UNAVAILABLE] cannot connect to docker daemon' },
      'Container action failed.'
    )
    expect(msg).toContain('Docker daemon/socket unavailable')
  })

  it('surfaces invalid payload contract failures clearly', () => {
    const msg = toUserFacingMessage('bad-payload', 'Container action failed.')
    expect(msg).toContain('invalid response payload')
  })
})
