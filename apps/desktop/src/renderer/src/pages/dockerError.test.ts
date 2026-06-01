import { describe, expect, it } from 'vitest'
import { humanizeDockerError } from './dockerError'

describe('humanizeDockerError', () => {
  it('maps stable docker error prefixes to user-safe messages', () => {
    expect(humanizeDockerError('[DOCKER_UNAVAILABLE] cannot connect to docker daemon')).toBe(
      'Docker is not running. Start Docker first, then try again.'
    )
    expect(humanizeDockerError('[DOCKER_PERMISSION_DENIED] permission denied')).toBe(
      "You don't have permission to access Docker. Run `sudo usermod -aG docker $USER` and log out/in."
    )
    expect(humanizeDockerError('[DOCKER_NOT_FOUND] no such container')).toContain("doesn't exist")
    expect(humanizeDockerError('[DOCKER_CONFLICT] already in use')).toContain('already exists')
    expect(humanizeDockerError('[DOCKER_TIMEOUT] request timed out')).toContain('timed out')
    expect(humanizeDockerError('[DOCKER_INVALID_REQUEST] bad payload')).toContain(
      'Invalid Docker request'
    )
    expect(humanizeDockerError('[HOST_COMMAND_TIMEOUT] docker ps')).toContain('too long')
    expect(humanizeDockerError('[DOCKER_INSTALL_NOT_SUPPORTED] use manual install')).toContain(
      'not supported in this environment'
    )
    expect(humanizeDockerError('[DOCKER_REMAP_NOT_SUPPORTED] use CLI')).toContain(
      'not supported in this environment'
    )
    expect(humanizeDockerError('[DOCKER_INSTALL_FAILED] apt failed')).toContain(
      'install step failed'
    )
    expect(humanizeDockerError('[DOCKER_REMAP_FAILED] create failed')).toContain('remap')
    expect(humanizeDockerError('[DOCKER_STATS_FAILED] command failed')).toContain(
      'Failed to fetch container stats'
    )
    expect(humanizeDockerError('[DOCKER_UNKNOWN] random low-level error')).toBe(
      'random low-level error'
    )
  })

  it('humanizes common raw docker daemon messages', () => {
    expect(
      humanizeDockerError(
        '[DOCKER_ACTION_FAILED] Error response from daemon: Conflict. The container name "/myapp_db_1" is already in use'
      )
    ).toBe('A container with this name already exists. Remove the old one first, or use a different name.')

    expect(
      humanizeDockerError(
        '[DOCKER_CREATE_FAILED] Bind for 0.0.0.0:3000 failed: port is already allocated'
      )
    ).toBe(
      'Port 3000 is already in use by another program. Stop that program first, or choose a different port.'
    )

    expect(humanizeDockerError('[DOCKER_PULL_FAILED] Error response from daemon: No such image: redis:missing')).toBe(
      "Docker couldn't find this image. Check the name and try again, or pull it first."
    )

    expect(
      humanizeDockerError(
        '[DOCKER_VOLUME_ACTION_FAILED] Error response from daemon: remove myvol: volume is in use'
      )
    ).toBe(
      'This volume is being used by a running container. Stop the container first, then try again.'
    )

    expect(
      humanizeDockerError('[DOCKER_ACTION_FAILED] Error response from daemon: container abc is not running')
    ).toBe('This container is stopped. Start it first, then try again.')

    expect(
      humanizeDockerError('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?')
    ).toBe('Docker is not running. Start Docker first, then try again.')

    expect(
      humanizeDockerError(
        '[DOCKER_LIST_FAILED] Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
      )
    ).toBe('Docker is not running. Start Docker first, then try again.')
  })

  it('falls back to raw text when code is missing and pattern is unknown', () => {
    expect(humanizeDockerError('plain runtime message')).toBe('plain runtime message')
  })
})
