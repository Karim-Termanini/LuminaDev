import { describe, expect, it } from 'vitest'
import { humanizeCloudAuthError, isCloudAuthOauthNotConfigured } from './cloudAuthError'

describe('isCloudAuthOauthNotConfigured', () => {
  it('detects bracket code in Error message', () => {
    expect(
      isCloudAuthOauthNotConfigured(
        new Error('[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] Set LUMINA_GITHUB_OAUTH_CLIENT_ID when building.'),
      ),
    ).toBe(true)
  })

  it('returns false for other errors', () => {
    expect(isCloudAuthOauthNotConfigured(new Error('[CLOUD_AUTH_NETWORK] timeout'))).toBe(false)
  })
})

describe('humanizeCloudAuthError', () => {
  it('humanizes CLOUD_AUTH_INVALID_TOKEN', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_AUTH_INVALID_TOKEN] token rejected'))
    expect(msg).toContain('token rejected')
    expect(msg).toContain('Account & security')
  })

  it('humanizes CLOUD_AUTH_NOT_CONNECTED', () => {
    const msg = humanizeCloudAuthError(
      new Error('[CLOUD_AUTH_NOT_CONNECTED] Connect this provider in Cloud Git first.'),
    )
    expect(msg).toContain('Connect this provider')
  })

  it('humanizes CLOUD_AUTH_NETWORK', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_AUTH_NETWORK] connection refused'))
    expect(msg).toContain('Check your connection')
  })

  it('humanizes CLOUD_AUTH_OAUTH_NOT_CONFIGURED', () => {
    const msg = humanizeCloudAuthError(
      new Error('[CLOUD_AUTH_OAUTH_NOT_CONFIGURED] Set client ID at build time.'),
    )
    expect(msg).toContain('Set client ID')
  })

  it('humanizes CLOUD_AUTH_DEVICE_START_REJECTED', () => {
    const msg = humanizeCloudAuthError(
      new Error('[CLOUD_AUTH_DEVICE_START_REJECTED] GitLab device authorization returned HTTP 401. '),
    )
    expect(msg).toContain('refused device sign-in')
    expect(msg).toContain('401')
  })

  it('humanizes CLOUD_AUTH_DEVICE_FLOW_DISABLED', () => {
    const msg = humanizeCloudAuthError(
      new Error('[CLOUD_AUTH_DEVICE_FLOW_DISABLED] Use a PAT on the Cloud Git page.'),
    )
    expect(msg).toContain('Use a PAT')
  })

  it('humanizes CLOUD_AUTH_DEVICE_POLL_REJECTED', () => {
    const msg = humanizeCloudAuthError(
      new Error(
        '[CLOUD_AUTH_DEVICE_POLL_REJECTED] GitHub token step returned error `incorrect_client_credentials`. The client_id and/or client_secret passed are incorrect.',
      ),
    )
    expect(msg).toContain('incorrect_client_credentials')
    expect(msg).toContain('client_id')
  })

  it('humanizes CLOUD_GIT_MR_BRANCH_NOT_ON_REMOTE', () => {
    const msg = humanizeCloudAuthError(
      new Error('[CLOUD_GIT_MR_BRANCH_NOT_ON_REMOTE] Push to GitLab first.'),
    )
    expect(msg).toContain('Push to GitLab first')
  })

  it('humanizes CLOUD_GIT_PR_EXISTS', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_GIT_PR_EXISTS] Already exists.'))
    expect(msg).toMatch(/already exists/i)
  })

  it('humanizes CLOUD_AUTH_STORE_* codes', () => {
    const msg = humanizeCloudAuthError(new Error('[CLOUD_AUTH_STORE_DECRYPT] Failed to decrypt credentials'))
    expect(msg).toContain('Could not read or save cloud account credentials')
  })

  it('returns raw detail for unknown codes', () => {
    const msg = humanizeCloudAuthError(new Error('Something unexpected'))
    expect(msg).toBe('Something unexpected')
  })

  it('handles non-Error values', () => {
    const msg = humanizeCloudAuthError('[CLOUD_AUTH_NETWORK] from string')
    expect(msg).toContain('Check your connection')
  })
})
