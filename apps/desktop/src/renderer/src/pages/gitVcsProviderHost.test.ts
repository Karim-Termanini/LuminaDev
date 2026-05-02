import { describe, expect, it } from 'vitest'
import { classifyGitRemoteUrl, resolvePipelineProvider, truncateMiddleUrl } from './gitVcsProviderHost'

describe('classifyGitRemoteUrl', () => {
  it('detects GitHub HTTPS and SSH', () => {
    expect(classifyGitRemoteUrl('https://github.com/org/repo.git')).toBe('github')
    expect(classifyGitRemoteUrl('git@github.com:org/repo.git')).toBe('github')
    expect(classifyGitRemoteUrl('ssh://git@github.com/org/repo.git')).toBe('github')
  })

  it('detects GitLab and self-hosted', () => {
    expect(classifyGitRemoteUrl('https://gitlab.com/group/proj.git')).toBe('gitlab')
    expect(classifyGitRemoteUrl('git@gitlab.example.com:group/proj.git')).toBe('gitlab')
  })

  it('returns other for unknown hosts', () => {
    expect(classifyGitRemoteUrl('https://codeberg.org/a/b.git')).toBe('other')
  })
})

describe('resolvePipelineProvider', () => {
  it('keeps SaaS classification', () => {
    expect(
      resolvePipelineProvider('https://github.com/o/r.git', [{ provider: 'gitlab' }]),
    ).toBe('github')
  })

  it('infers GitHub when only GitHub is linked', () => {
    expect(
      resolvePipelineProvider('https://git.corp.example/o/r.git', [{ provider: 'github' }]),
    ).toBe('github')
  })

  it('infers GitLab when only GitLab is linked', () => {
    expect(
      resolvePipelineProvider('https://git.corp.example/o/r.git', [{ provider: 'gitlab' }]),
    ).toBe('gitlab')
  })

  it('defaults to GitHub when both are linked and host is unknown', () => {
    expect(
      resolvePipelineProvider('https://git.corp.example/o/r.git', [
        { provider: 'github' },
        { provider: 'gitlab' },
      ]),
    ).toBe('github')
  })

  it('returns other when host is unknown and no accounts', () => {
    expect(resolvePipelineProvider('https://git.corp.example/o/r.git', [])).toBe('other')
  })
})

describe('truncateMiddleUrl', () => {
  it('leaves short strings unchanged', () => {
    expect(truncateMiddleUrl('https://a/b', 40)).toBe('https://a/b')
  })

  it('truncates long URLs', () => {
    const long = 'https://github.com/very/long/org/repo-name.git'
    const out = truncateMiddleUrl(long, 28)
    expect(out.length).toBeLessThanOrEqual(28)
    expect(out).toContain('…')
  })
})
