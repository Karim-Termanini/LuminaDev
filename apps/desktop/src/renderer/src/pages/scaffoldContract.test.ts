import { describe, expect, it } from 'vitest'
import { assertScaffoldOk, assertScaffoldDepsOk } from './scaffoldContract'

describe('assertScaffoldOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertScaffoldOk({ ok: true })).not.toThrow()
  })

  it('does nothing for success with path', () => {
    expect(() => assertScaffoldOk({ ok: true, path: '/tmp/proj' })).not.toThrow()
  })

  it('throws with explicit scaffold error', () => {
    expect(() =>
      assertScaffoldOk({ ok: false, error: '[SCAFFOLD_FAILED] Missing path.' }),
    ).toThrow('[SCAFFOLD_FAILED] Missing path.')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertScaffoldOk({ ok: false }, 'Custom fallback')).toThrow('Custom fallback')
  })

  it('throws when response payload is not an object', () => {
    expect(() => assertScaffoldOk('unexpected-string', 'Custom fallback')).toThrow(
      'Custom fallback (invalid response payload)',
    )
  })

  it('throws when ok flag is missing', () => {
    expect(() => assertScaffoldOk({ path: '/tmp/proj' }, 'Custom fallback')).toThrow(
      'Custom fallback (missing ok flag)',
    )
  })
})

describe('assertScaffoldDepsOk', () => {
  it('does nothing for success payloads', () => {
    expect(() => assertScaffoldDepsOk({ ok: true })).not.toThrow()
  })

  it('throws with explicit install error', () => {
    expect(() =>
      assertScaffoldDepsOk({ ok: false, error: '[INSTALL_ERROR] npm not found' }),
    ).toThrow('[INSTALL_ERROR] npm not found')
  })

  it('throws with fallback when error is missing', () => {
    expect(() => assertScaffoldDepsOk({ ok: false }, 'Deps failed')).toThrow('Deps failed')
  })

  it('throws when response is not an object', () => {
    expect(() => assertScaffoldDepsOk('bad', 'Deps failed')).toThrow(
      'Deps failed (invalid response payload)',
    )
  })
})
