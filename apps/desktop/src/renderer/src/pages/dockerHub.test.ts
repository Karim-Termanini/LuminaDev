import { describe, expect, it } from 'vitest'

import { dockerHubRepositoryUrl } from './dockerHub'

describe('dockerHubRepositoryUrl', () => {
  it('uses official namespace for bare image names', () => {
    expect(dockerHubRepositoryUrl('nginx')).toBe('https://hub.docker.com/_/nginx')
  })

  it('maps docker library namespace to official hub URLs', () => {
    expect(dockerHubRepositoryUrl('library/redis')).toBe('https://hub.docker.com/_/redis')
  })

  it('uses repository namespace for non-library images', () => {
    expect(dockerHubRepositoryUrl('bitnami/postgresql')).toBe('https://hub.docker.com/r/bitnami/postgresql')
  })

  it('normalizes docker.io-prefixed names', () => {
    expect(dockerHubRepositoryUrl('docker.io/library/httpd')).toBe('https://hub.docker.com/_/httpd')
  })
})
