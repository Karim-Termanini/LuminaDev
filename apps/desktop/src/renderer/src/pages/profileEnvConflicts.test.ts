import { describe, expect, it } from 'vitest'
import type { CustomProfileEntry } from '@linux-dev-home/shared'
import {
  collectUsedPorts,
  envPresetsFromPortSuggest,
  findEnvConflicts,
  generateUniqueEnvVars,
  getTemplateEnvPresets,
  isBeginnerBundleApplied,
  mergeEnvPresetBundle,
  nextFreePort,
  partitionBeginnerEnvPresets,
  runtimePortsFromSuggest,
  suggestUniqueProfileName,
  syncDatabaseUrlWithPostgres,
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
    const conflicts = findEnvConflicts(existing, [{ key: 'NODE_PORT', value: '3000' }], null)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.otherProfileName).toBe('Frontend')
    expect(conflicts[0]?.reason).toBe('duplicate')
  })

  it('detects port collision across different keys', () => {
    const conflicts = findEnvConflicts(existing, [{ key: 'PORT', value: '54321' }], null)
    expect(conflicts.some((c) => c.reason === 'port')).toBe(true)
  })

  it('detects runtime-assigned port conflicts from store', () => {
    const runtime = runtimePortsFromSuggest('Frontend', { node: 3000, postgres: 54321 })
    const conflicts = findEnvConflicts(
      [],
      [{ key: 'NODE_PORT', value: '3000' }],
      null,
      runtime
    )
    expect(conflicts.some((c) => c.otherProfileName === 'Frontend')).toBe(true)
  })

  it('detects internal port conflicts within the wizard', () => {
    const conflicts = findEnvConflicts(
      [],
      [
        { key: 'NODE_PORT', value: '3000' },
        { key: 'PORT', value: '3000' },
      ],
      null
    )
    expect(conflicts.some((c) => c.reason === 'internal')).toBe(true)
  })

  it('allows DATABASE_URL to share POSTGRES_PORT in the same profile', () => {
    const conflicts = findEnvConflicts(
      [],
      [
        { key: 'POSTGRES_PORT', value: '54320' },
        {
          key: 'DATABASE_URL',
          value: 'postgresql://postgres:luminadev@localhost:54320/datasci',
        },
        { key: 'JUPYTER_PORT', value: '8888' },
      ],
      null
    )
    expect(conflicts.filter((c) => c.reason === 'internal')).toHaveLength(0)
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
    const unique = generateUniqueEnvVars('web-dev', 'New App', existing, null, [
      { key: 'NODE_PORT', value: '3000' },
      { key: 'POSTGRES_PORT', value: '54321' },
      { key: 'NODE_ENV', value: 'development' },
    ])
    const nodePort = Number.parseInt(unique.find((v) => v.key === 'NODE_PORT')?.value ?? '', 10)
    const pgPort = Number.parseInt(unique.find((v) => v.key === 'POSTGRES_PORT')?.value ?? '', 10)
    expect(nodePort).not.toBe(3000)
    expect(pgPort).not.toBe(54321)
    expect(unique.find((v) => v.key === 'NODE_ENV')?.value).toBe('development')
  })

  it('keeps DATABASE_URL in sync with POSTGRES_PORT', () => {
    const synced = syncDatabaseUrlWithPostgres(
      [
        { key: 'POSTGRES_PORT', value: '54399' },
        { key: 'DATABASE_URL', value: 'postgresql://postgres:luminadev@localhost:54321/webapp' },
      ],
      'web-dev'
    )
    expect(synced.find((v) => v.key === 'DATABASE_URL')?.value).toContain(':54399/')
  })

  it('generateUniqueEnvVars syncs DATABASE_URL after reassignment', () => {
    const unique = generateUniqueEnvVars('web-dev', 'New App', existing, null, [
      { key: 'POSTGRES_PORT', value: '54321' },
      { key: 'DATABASE_URL', value: 'postgresql://postgres:luminadev@localhost:54321/webapp' },
    ])
    const pg = unique.find((v) => v.key === 'POSTGRES_PORT')?.value
    const db = unique.find((v) => v.key === 'DATABASE_URL')?.value
    expect(db).toContain(`:${pg}/`)
  })

  it('builds template presets with non-colliding ports', () => {
    const presets = getTemplateEnvPresets('web-dev', 'Side Project', existing, null)
    const nodePort = Number.parseInt(presets.find((p) => p.key === 'NODE_PORT')?.value ?? '', 10)
    const used = collectUsedPorts(existing, null)
    expect(used.has(nodePort)).toBe(false)
  })

  it('partitions beginner presets into port bundle vs optional dev toggles', () => {
    const presets = envPresetsFromPortSuggest('data-science', {
      jupyter: 8888,
      postgres: 54320,
    })
    const { recommended, optional } = partitionBeginnerEnvPresets(presets)
    expect(recommended.some((p) => p.key === 'JUPYTER_PORT')).toBe(true)
    expect(recommended.some((p) => p.key === 'DATABASE_URL')).toBe(true)
    expect(optional).toHaveLength(0)
    const merged = mergeEnvPresetBundle([], recommended, true)
    expect(isBeginnerBundleApplied(merged, recommended)).toBe(true)
  })

  it('builds presets from dh:ports:suggest shape', () => {
    const presets = envPresetsFromPortSuggest('web-dev', {
      node: 3100,
      node_hmr: 5273,
      postgres: 54400,
    })
    expect(presets.find((p) => p.key === 'NODE_PORT')?.value).toBe('3100')
    expect(presets.find((p) => p.key === 'DATABASE_URL')?.value).toContain(':54400/')
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
