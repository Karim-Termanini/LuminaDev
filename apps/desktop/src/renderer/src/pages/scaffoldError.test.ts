import { describe, expect, it } from 'vitest'
import { humanizeScaffoldError } from './scaffoldError'

describe('humanizeScaffoldError', () => {
  it('humanizes SCAFFOLD_FAILED', () => {
    const msg = humanizeScaffoldError('[SCAFFOLD_FAILED] Missing path.')
    expect(msg).toContain('Could not scaffold project')
    expect(msg).toContain('Missing path.')
  })

  it('humanizes PROJECT_CREATE_FAILED', () => {
    const msg = humanizeScaffoldError('[PROJECT_CREATE_FAILED] permission denied')
    expect(msg).toContain('Could not create project directory')
  })

  it('humanizes INSTALL_ERROR', () => {
    const msg = humanizeScaffoldError('[INSTALL_ERROR] npm install failed')
    expect(msg).toContain('Failed to install project dependencies')
  })

  it('humanizes EDITOR_OPEN_FAILED', () => {
    const msg = humanizeScaffoldError('[EDITOR_OPEN_FAILED] editor not found')
    expect(msg).toContain('Could not open editor')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeScaffoldError('plain error message')).toBe('plain error message')
  })

  it('falls back to default when raw is empty', () => {
    expect(humanizeScaffoldError('')).toBe('Project operation failed.')
  })
})
