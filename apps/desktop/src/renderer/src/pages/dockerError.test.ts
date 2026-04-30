import { describe, expect, it } from 'vitest'
import { humanizeDockerError } from './dockerError'

describe('humanizeDockerError', () => {
  it('maps stable docker error prefixes to user-safe messages', () => {
    expect(humanizeDockerError('[DOCKER_UNAVAILABLE] cannot connect to docker daemon')).toContain('Docker daemon/socket unavailable')
    expect(humanizeDockerError('[DOCKER_PERMISSION_DENIED] permission denied')).toContain('Docker permission denied')
    expect(humanizeDockerError('[DOCKER_NOT_FOUND] no such container')).toContain('not found')
    expect(humanizeDockerError('[DOCKER_CONFLICT] already in use')).toContain('Docker conflict')
    expect(humanizeDockerError('[DOCKER_TIMEOUT] request timed out')).toContain('timed out')
    expect(humanizeDockerError('[DOCKER_INVALID_REQUEST] bad payload')).toContain('Invalid Docker request')
    expect(humanizeDockerError('[HOST_COMMAND_TIMEOUT] docker ps')).toContain('too long')
    expect(humanizeDockerError('[DOCKER_INSTALL_NOT_SUPPORTED] use manual install')).toContain('not available')
    expect(humanizeDockerError('[DOCKER_INSTALL_NOT_SUPPORTED] use manual install')).toMatch(/flatpak/i)
    expect(humanizeDockerError('[DOCKER_REMAP_NOT_SUPPORTED] use CLI')).toContain('not supported')
    expect(humanizeDockerError('[DOCKER_REMAP_NOT_SUPPORTED] use CLI')).toMatch(/flatpak/i)
    expect(humanizeDockerError('[DOCKER_INSTALL_FAILED] apt failed')).toContain('install step failed')
    expect(humanizeDockerError('[DOCKER_REMAP_FAILED] create failed')).toContain('remap')
    expect(humanizeDockerError('[DOCKER_UNKNOWN] random low-level error')).toContain('random low-level error')
  })

  it('falls back to raw text when code is missing', () => {
    expect(humanizeDockerError('plain runtime message')).toBe('plain runtime message')
  })
})
