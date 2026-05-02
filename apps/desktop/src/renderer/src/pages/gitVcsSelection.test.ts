import type { FileEntry } from '@linux-dev-home/shared'
import { describe, expect, it } from 'vitest'
import { reconcileGitVcsSelection } from './gitVcsSelection'

const f = (path: string, status: FileEntry['status'] = 'M'): FileEntry => ({ path, status })

describe('reconcileGitVcsSelection', () => {
  it('returns null when nothing selected', () => {
    expect(reconcileGitVcsSelection(null, [f('a.ts')], [])).toBeNull()
  })

  it('returns null when file disappeared', () => {
    expect(reconcileGitVcsSelection({ path: 'gone.ts', staged: false }, [], [])).toBeNull()
  })

  it('moves to staged-only after full stage', () => {
    expect(reconcileGitVcsSelection({ path: 'a.ts', staged: false }, [f('a.ts')], [])).toEqual({
      path: 'a.ts',
      staged: true,
    })
  })

  it('moves to unstaged-only after full unstage', () => {
    expect(reconcileGitVcsSelection({ path: 'a.ts', staged: true }, [], [f('a.ts')])).toEqual({
      path: 'a.ts',
      staged: false,
    })
  })

  it('keeps staged flag when file in both index and worktree', () => {
    expect(reconcileGitVcsSelection({ path: 'a.ts', staged: false }, [f('a.ts')], [f('a.ts')])).toEqual({
      path: 'a.ts',
      staged: false,
    })
    expect(reconcileGitVcsSelection({ path: 'a.ts', staged: true }, [f('a.ts')], [f('a.ts')])).toEqual({
      path: 'a.ts',
      staged: true,
    })
  })
})
