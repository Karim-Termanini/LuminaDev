import { describe, expect, it } from 'vitest'
import { assertScaffoldOk } from './scaffoldContract'
import { humanizeScaffoldError } from './scaffoldError'

function toUserFacingMessage(result: unknown, fallback: string): string {
  try {
    assertScaffoldOk(result, fallback)
    return ''
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    return humanizeScaffoldError(raw)
  }
}

describe('scaffold IPC contract integration', () => {
  it('humanizes missing path failure', () => {
    const msg = toUserFacingMessage(
      { ok: false, error: '[SCAFFOLD_FAILED] Missing path.' },
      'Project scaffolding failed.',
    )
    expect(msg).toContain('Could not scaffold project')
    expect(msg).toContain('Missing path.')
  })

  it('humanizes directory creation failure', () => {
    const msg = toUserFacingMessage(
      { ok: false, error: '[PROJECT_CREATE_FAILED] Could not create directory: permission denied' },
      'Project scaffolding failed.',
    )
    expect(msg).toContain('Could not create project directory')
  })

  it('surfaces invalid payload contract failures clearly', () => {
    const msg = toUserFacingMessage('bad-payload', 'Project scaffolding failed.')
    expect(msg).toContain('invalid response payload')
  })
})
