import { describe, expect, it } from 'vitest'

import { dockerErrorString } from './dockerError'

describe('dockerErrorString', () => {
  it('maps permission errors to stable permission code', () => {
    expect(dockerErrorString(new Error('permission denied on /var/run/docker.sock'), 'fallback')).toMatch(
      /^\[DOCKER_PERMISSION_DENIED\]/
    )
  })

  it('maps daemon connectivity issues to unavailable code', () => {
    expect(dockerErrorString(new Error('Cannot connect to Docker daemon'), 'fallback')).toMatch(
      /^\[DOCKER_UNAVAILABLE\]/
    )
  })

  it('falls back to unknown code when no pattern matches', () => {
    expect(dockerErrorString(new Error('some random failure'), 'fallback')).toMatch(/^\[DOCKER_UNKNOWN\]/)
  })

  it('maps not-found resource errors', () => {
    expect(dockerErrorString(new Error('No such container: abc123'), 'fallback')).toMatch(/^\[DOCKER_NOT_FOUND\]/)
  })

  it('maps conflict-style errors', () => {
    expect(dockerErrorString(new Error('conflict: image is being used by stopped container'), 'fallback')).toMatch(
      /^\[DOCKER_CONFLICT\]/
    )
  })

  it('maps timeout errors', () => {
    expect(dockerErrorString(new Error('request timed out'), 'fallback')).toMatch(/^\[DOCKER_TIMEOUT\]/)
  })
})
