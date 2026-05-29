import { describe, expect, it } from 'vitest'
import type { CustomProfileEntry } from '@linux-dev-home/shared'
import {
  collectUsedPorts,
  findEnvConflicts,
  generateUniqueEnvVars,
  getTemplateEnvPresets,
  nextFreePort,
  suggestUniqueProfileName,
} from './profileEnvConflicts'

const existing: CustomProfileEntry[] = [
  {
    name: 'Frontend',
    baseTemplate: 'web-dev',
    envVars: [
      { key: 'NODE_PORT', value: '3000' },
      { key: 'POSTGRES_PORT', value: '54321' },
    ],
  },
  {
    name: 'Backend',
    baseTemplate: 'web-dev',
    envVars: [{ key: 'NODE_PORT', value: '3010' }],
  },
]

describe('profileEnvConflicts', () => {
  it('detects exact duplicate env values', () => {
    const conflicts = findEnvConflicts(
      existing,
      [{ key: 'NODE_PORT', value: '3000' }],
      null
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.otherProfileName).toBe('Frontend')
    expect(conflicts[0]?.reason).toBe('duplicate')
  })

  it('detects port collision across different keys', () => {
    const conflicts = findEnvConflicts(
      existing,
      [{ key: 'PORT', value: '54321' }],
      null
    )
    expect(conflicts.some((c) => c.reason === 'port')).toBe(true)
  })

  it('ignores conflicts when editing the same profile', () => {
    const conflicts = findEnvConflicts(
      existing,
      [{ key: 'NODE_PORT', value: '3000' }],
      0
    )
    expect(conflicts).toHaveLength(0)
  })

  it('generates unique ports for conflicting vars', () => {
    const unique = generateUniqueEnvVars(
      'web-dev',
      'New App',
      existing,
      null,
      [
        { key: 'NODE_PORT', value: '3000' },
        { key: 'POSTGRES_PORT', value: '54321' },
        { key: 'NODE_ENV', value: 'development' },
      ]
    )
    const nodePort = Number.parseInt(unique.find((v) => v.key === 'NODE_PORT')?.value ?? '', 10)
    const pgPort = Number.parseInt(unique.find((v) => v.key === 'POSTGRES_PORT')?.value ?? '', 10)
    expect(nodePort).not.toBe(3000)
    expect(pgPort).not.toBe(54321)
    expect(unique.find((v) => v.key === 'NODE_ENV')?.value).toBe('development')
  })

  it('builds template presets with non-colliding ports', () => {
    const presets = getTemplateEnvPresets('web-dev', 'Side Project', existing, null)
    const nodePort = Number.parseInt(
      presets.find((p) => p.key === 'NODE_PORT')?.value ?? '',
      10
    )
    const used = collectUsedPorts(existing, null)
    expect(used.has(nodePort)).toBe(false)
  })

  it('finds next free port', () => {
    const used = new Set([3000, 3001, 3002])
    expect(nextFreePort(3000, used)).toBe(3003)
  })

  it('suggests a unique profile name', () => {
    expect(suggestUniqueProfileName('Frontend', existing, null)).toBe('Frontend 2')
    expect(suggestUniqueProfileName('Frontend', existing, 0)).toBe('Frontend')
  })
})
