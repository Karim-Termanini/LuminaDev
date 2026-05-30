import { describe, expect, it } from 'vitest'

import { branchWebUrl, githubRepoWebUrl, gitlabRepoWebUrl, hostRepoWebLink } from './gitAssistantRemoteUrl'

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

describe('gitlabRepoWebUrl', () => {
  it('parses HTTPS origin', () => {
    expect(gitlabRepoWebUrl('https://gitlab.com/group/sub.git')).toBe('https://gitlab.com/group/sub')
  })

  it('parses SSH origin', () => {
    expect(gitlabRepoWebUrl('git@gitlab.com:group/sub.git')).toBe('https://gitlab.com/group/sub')
  })
})

describe('hostRepoWebLink', () => {
  it('builds branch URLs per host', () => {
    const gh = hostRepoWebLink('https://github.com/acme/widget.git')
    expect(gh).toEqual({ provider: 'github', repoUrl: 'https://github.com/acme/widget' })
    expect(branchWebUrl(gh!, 'main')).toBe('https://github.com/acme/widget/tree/main')

    const gl = hostRepoWebLink('git@gitlab.com:group/sub.git')
    expect(gl?.provider).toBe('gitlab')
    expect(branchWebUrl(gl!, 'dev')).toContain('/-/tree/dev')
  })
})
