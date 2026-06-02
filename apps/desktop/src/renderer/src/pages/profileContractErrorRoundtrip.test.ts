import { describe, expect, it } from 'vitest'
import { assertProfileSwitchOk } from './profileContract'
import { humanizeProfileError } from './profileError'

function toUserFacingMessage(result: unknown, fallback: string): string {
  try {
    assertProfileSwitchOk(result, fallback)
    return ''
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    return humanizeProfileError(raw)
  }
}

describe('profile IPC contract + error roundtrip', () => {
  it('humanizes profile switch unavailable failure', () => {
    const msg = toUserFacingMessage(
      { ok: false, error: '[DOCKER_UNAVAILABLE] Docker daemon is not reachable' },
      'Profile switch failed.',
    )
    expect(msg).toContain('Docker is not running')
  })

  it('humanizes profile switch invalid failure', () => {
    const msg = toUserFacingMessage(
      { ok: false, error: "[PROFILE_SWITCH_INVALID] 'to' profile required" },
      'Profile switch failed.',
    )
    expect(msg).toContain('Invalid profile switch')
  })

  it('humanizes compose directory missing failure', () => {
    const msg = toUserFacingMessage(
      {
        ok: false,
        log: '',
        error:
          '[PROFILE_SWITCH_FAILED] missing compose directory: /tmp/bogus (set LUMINA_DEV_COMPOSE_ROOT or run from a checkout with docker/compose)',
      },
      'Profile switch failed.',
    )
    expect(msg).toContain('Could not switch profiles')
  })

  it('surfaces invalid payload contract failures clearly', () => {
    const msg = toUserFacingMessage('bad-payload', 'Profile switch failed.')
    expect(msg).toContain('invalid response payload')
  })
})
