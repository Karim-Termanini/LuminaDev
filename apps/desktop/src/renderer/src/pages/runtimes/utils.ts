import type { RuntimeStatus } from '@linux-dev-home/shared'
import { isSupportedRuntimeId } from '@linux-dev-home/shared'

export type InstalledVersionRow = {
  version: string
  path: string
  label?: string
  javaHome?: string
  isDefault?: boolean
  isSystemDefault?: boolean
}

/** Java rows Lumina can switch (mise global, archlinux-java, alternatives, etc.). */
export function javaRowSupportsSetActive(path: string): boolean {
  return (
    path.includes('/usr/lib/jvm/') ||
    path.includes('/usr/java/') ||
    path.includes('/.local/share/lumina/java/') ||
    path.includes('/.local/share/mise/installs/java/') ||
    path.includes('/.sdkman/candidates/java/') ||
    path.includes('/.jdks/')
  )
}

export type UninstallPreview = {
  distro: string
  runtimePackages: string[]
  removableDeps: string[]
  blockedSharedDeps: string[]
  finalPackages: string[]
  note?: string
}

export type RemoveMode = 'runtime_only' | 'runtime_and_deps'

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

/** Match an installed row to the shell-resolved active binary path from set-active. */
export function installedVersionMatchesActive(rowPath: string, activePath: string): boolean {
  if (!activePath) return false
  const norm = (p: string) => p.replace(/\\/g, '/').trim()
  const row = norm(rowPath)
  const active = norm(activePath)
  if (row === active || row.endsWith(active) || active.endsWith(row)) return true
  if (
    (row.includes('/usr/bin/') || row.includes('/usr/local/bin/')) &&
    (active.includes('/usr/bin/') || active.includes('/usr/local/bin/'))
  ) {
    return true
  }
  const nodeTag = (p: string) => {
    const nvm = p.match(/\/versions\/node\/([^/]+)\/bin\/node$/)
    if (nvm) return nvm[1]
    const mise = p.match(/\/mise\/installs\/node\/([^/]+)\/bin\/node$/)
    if (mise) return mise[1]
    return null
  }
  const a = nodeTag(row)
  const b = nodeTag(active)
  return a !== null && a === b
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
