import type { RuntimeStatus } from '@linux-dev-home/shared'
import { isSupportedRuntimeId } from '@linux-dev-home/shared'

export const RUNTIME_DETAILS: Record<string, { website: string; icon: string }> = {
  node: { website: 'https://nodejs.org', icon: 'symbol-method' },
  rust: { website: 'https://rust-lang.org', icon: 'tools' },
  python: { website: 'https://python.org', icon: 'symbol-keyword' },
  go: { website: 'https://go.dev', icon: 'zap' },
  java: { website: 'https://java.com', icon: 'beaker' },
  php: { website: 'https://php.net', icon: 'globe' },
  dotnet: { website: 'https://dotnet.microsoft.com', icon: 'library' },
}

export const UPDATE_OUTCOME_STORAGE_KEY = 'dh:runtimes:update-outcomes:v2'
export const STATUS_CACHE_KEY = 'dh:runtimes:status-cache:v2'
export const STATUS_CACHE_TTL = 30 * 1000
export const VERSIONS_CACHE_KEY = 'dh:runtimes:versions-cache:v2'
export const VERSIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export type InstalledVersionRow = {
  version: string
  path: string
  label?: string
  javaHome?: string
  isDefault?: boolean
}

export function filterSupportedRuntimes(rows: RuntimeStatus[]): RuntimeStatus[] {
  return rows.filter((r) => isSupportedRuntimeId(r.id))
}

/** Strip redundant runtime name prefixes from probe output for display. */
export function formatRuntimeVersionDisplay(runtimeId: string, raw: string | undefined): string {
  if (!raw) return ''
  const v = raw.trim()
  switch (runtimeId) {
    case 'python':
      return v.replace(/^Python\s+/i, '')
    case 'java': {
      const quoted = v.match(/"([^"]+)"/)
      if (quoted) return quoted[1]
      return v
    }
    case 'go':
      return v.replace(/^go version go/i, 'go').replace(/\s+linux\/\S+$/, '').trim() || v
    case 'php':
      return v.replace(/^PHP\s+/i, '').replace(/\s+\(.*$/, '').trim()
    case 'rust':
      return v.replace(/^rustc\s+/, '').replace(/\s+\([^)]*\)\s*$/, '').trim() || v
    default:
      return v
  }
}

export function installedVersionLabel(runtimeId: string, row: InstalledVersionRow): string {
  if (row.label) return row.label
  return formatRuntimeVersionDisplay(runtimeId, row.version)
}

export function installedVersionKey(row: InstalledVersionRow): string {
  return `${row.path}\0${row.version}`
}

/** Prefer a sensible default when the version API returns many entries (e.g. Node: first LTS row). */
export function pickDefaultRuntimeVersion(runtimeId: string, versions: string[]): string {
  if (versions.length === 0) return 'latest'
  if (runtimeId === 'node') {
    const lts = versions.find((v) => /\bLTS\b/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'java') {
    const lts = versions.find((v) => /\(LTS\)/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'dotnet') {
    const lts = versions.find((v) => /\bLTS\b/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'rust') {
    return versions.includes('stable') ? 'stable' : versions[0]
  }
  return versions[0]
}
