import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PULL_REQUEST_BASE,
  hostNewPullRequestUrl,
  isDefaultIntegrationBranch,
} from './gitAssistantPullRequestUrl'

describe('hostNewPullRequestUrl', () => {
  it('builds GitHub compare URL', () => {
    const url = hostNewPullRequestUrl(
      { provider: 'github', repoUrl: 'https://github.com/acme/widget' },
      'feature/x',
      DEFAULT_PULL_REQUEST_BASE,
    )
    expect(url).toBe(
      'https://github.com/acme/widget/compare/main...feature%2Fx?expand=1',
    )
  })

  it('builds GitLab new MR URL', () => {
    const url = hostNewPullRequestUrl(
      { provider: 'gitlab', repoUrl: 'https://gitlab.com/group/sub' },
      'dev',
      'main',
    )
    expect(url).toContain('/-/merge_requests/new?')
    expect(url).toContain('merge_request%5Bsource_branch%5D=dev')
    expect(url).toContain('merge_request%5Btarget_branch%5D=main')
  })
})

describe('isDefaultIntegrationBranch', () => {
  it('flags main and master', () => {
    expect(isDefaultIntegrationBranch('main')).toBe(true)
    expect(isDefaultIntegrationBranch('feature/foo')).toBe(false)
  })
})
