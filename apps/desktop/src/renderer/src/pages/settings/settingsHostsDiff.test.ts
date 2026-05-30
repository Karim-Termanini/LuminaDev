import { describe, expect, it } from 'vitest'
import { hostsHasChanges, hostsLineDiff, normalizeHostsText } from './settingsHostsDiff'

describe('settingsHostsDiff', () => {
  it('normalizes CRLF and trailing whitespace', () => {
    expect(normalizeHostsText('127.0.0.1 localhost\r\n')).toBe('127.0.0.1 localhost')
  })

  it('detects line additions and removals', () => {
    const before = '127.0.0.1 localhost\n::1 localhost'
    const after = '127.0.0.1 localhost\n127.0.0.1 myapp.local'
    expect(hostsLineDiff(before, after)).toEqual([
      '- ::1 localhost',
      '+ 127.0.0.1 myapp.local',
    ])
  })

  it('reports no change when content matches', () => {
    const text = '127.0.0.1 localhost\n'
    expect(hostsHasChanges(text, text)).toBe(false)
    expect(hostsHasChanges('a\n', 'a')).toBe(false)
  })
})
