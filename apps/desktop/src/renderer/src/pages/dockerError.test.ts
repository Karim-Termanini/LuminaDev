import { describe, expect, it } from 'vitest'
import { humanizeDockerError } from './dockerError'

describe('humanizeDockerError', () => {
  it('maps stable docker error prefixes to user-safe messages', () => {
    expect(humanizeDockerError('[DOCKER_UNAVAILABLE] cannot connect to docker daemon')).toContain('Docker daemon/socket unavailable')
    expect(humanizeDockerError('[DOCKER_PERMISSION_DENIED] permission denied')).toContain('Docker permission denied')
    expect(humanizeDockerError('[DOCKER_NOT_FOUND] no such container')).toContain('not found')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeDockerError('plain runtime message')).toBe('plain runtime message')
  })
})
