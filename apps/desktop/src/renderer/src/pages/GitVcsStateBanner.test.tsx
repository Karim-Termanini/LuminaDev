import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GitVcsStateBanner } from './GitVcsStateBanner'

describe('GitVcsStateBanner', () => {
  it('renders nothing when idle', () => {
    expect(renderToStaticMarkup(<GitVcsStateBanner operation="none" conflictFileCount={0} />)).toBe('')
  })

  it('includes merge title and conflict count', () => {
    const html = renderToStaticMarkup(<GitVcsStateBanner operation="merging" conflictFileCount={2} />)
    expect(html).toContain('Merge in progress')
    expect(html).toContain('2 files still have merge conflicts')
  })

  it('includes rebase title', () => {
    const html = renderToStaticMarkup(<GitVcsStateBanner operation="rebasing" conflictFileCount={0} />)
    expect(html).toContain('Rebase in progress')
  })
})
