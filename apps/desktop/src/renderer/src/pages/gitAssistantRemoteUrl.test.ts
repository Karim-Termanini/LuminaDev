import { describe, expect, it } from 'vitest'

import { githubRepoWebUrl } from './gitAssistantRemoteUrl'

describe('githubRepoWebUrl', () => {
  it('parses HTTPS origin', () => {
    expect(githubRepoWebUrl('https://github.com/acme/widget.git')).toBe('https://github.com/acme/widget')
  })

  it('parses SSH origin', () => {
    expect(githubRepoWebUrl('git@github.com:acme/widget.git')).toBe('https://github.com/acme/widget')
  })

  it('returns null for GitLab', () => {
    expect(githubRepoWebUrl('git@gitlab.com:group/sub.git')).toBeNull()
  })
})
