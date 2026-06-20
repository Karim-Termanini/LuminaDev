import { describe, expect, it } from 'vitest'
import { isGithubPublicKeyDenied } from './githubTest'

describe('isGithubPublicKeyDenied', () => {
  it('detects GitHub publickey rejection', () => {
    expect(isGithubPublicKeyDenied('git@github.com: Permission denied (publickey).')).toBe(true)
  })

  it('returns false for success output', () => {
    expect(isGithubPublicKeyDenied("Hi user! You've successfully authenticated")).toBe(false)
  })
})
