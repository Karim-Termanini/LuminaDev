import fs, { readFileSync, statfsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os, { cpus, freemem, homedir, loadavg, tmpdir, totalmem, uptime } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import Docker from 'dockerode'
import pty from 'node-pty'
import simpleGit from 'simple-git'
import { z } from 'zod'

import {
  ComposeUpRequestSchema,
  DashboardLayoutFileSchema,
  DockerContainerActionSchema,
  DockerCreateRequestSchema,
  DockerImageActionRequestSchema,
  DockerLogsRequestSchema,
  DockerPullRequestSchema,
  DockerRemapPortRequestSchema,
  DockerNetworkActionRequestSchema,
  DockerNetworkCreateRequestSchema,
  DockerVolumeActionRequestSchema,
  DockerVolumeCreateRequestSchema,
  GitCloneRequestSchema,
  GitRecentAddSchema,
  GitStatusRequestSchema,
  HostExecRequestSchema,
  IPC,
  JobCancelRequestSchema,
  JobStartRequestSchema,
  WizardStateStoreSchema,
  defaultDashboardLayout,
  isRegisteredWidgetType,
  type ContainerRow,
  type DashboardLayoutFile,
  type DockerActionPayload,
  type DockerImageActionPayload,
  type DockerNetworkActionPayload,
  type DockerVolumeActionPayload,
  type GitRepoEntry,
  type HostMetrics,
  type HostMetricsResponse,
  type HostSecurityDrilldown,
  type HostSecuritySnapshot,
  type ImageRow,
  type JobSummary,
  type NetworkRow,
  type SessionInfo,
  type SystemdRow,
  type VolumeRow,
  type HostPortRow,
  type HostSysInfo,
  type TopProcessRow,
  CustomProfilesStoreSchema,
  StoreGetRequestSchema,
  StoreSetRequestSchema,
  GitConfigListSchema,
  GitConfigSetSchema,
  SshGenerateSchema,
  SshGetPubSchema,
  SshTestGithubSchema,
  type RuntimeStatusResponse,
} from '@linux-dev-home/shared'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

nativeTheme.themeSource = 'dark'

if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

let mainWindow: BrowserWindow | null = null
let docker: Docker | null = null
const terminals = new Map<string, pty.IPty>()
const SYSTEMD_UNITS = ['nginx', 'ssh', 'ufw', 'docker'] as const

type JobRecord = {
  id: string
  kind: string
  state: 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  log: string[]
  cancelRequested: boolean
  timer?: ReturnType<typeof setInterval>
  proc?: ReturnType<typeof spawn>
  /** Wall-clock start for time-based progress floor (long host installs). */
  progressStartedAtMs?: number
  lastStreamProgressAtMs?: number
}

const jobs = new Map<string, JobRecord>()

/**
 * Stream-based progress bumps are throttled and mixed with a slow time spine so
 * noisy stdout cannot jump to 95% in the first seconds of a multi-minute install.
 */
function createJobStreamProgress(job: JobRecord, opts?: { spineMs?: number; minGapMs?: number; cap?: number }): {
  bump: (delta: number) => void
} {
  const t0 = Date.now()
  job.progressStartedAtMs = t0
  const spineMs = opts?.spineMs ?? 120_000
  const minGapMs = opts?.minGapMs ?? 420
  const cap = opts?.cap ?? 94
  return {
    bump(delta: number) {
      const now = Date.now()
      const spine = Math.min(87, Math.floor(((now - t0) / spineMs) * 87))
      const last = job.lastStreamProgressAtMs ?? 0
      const aheadOfSpine = job.progress > spine + 4
      if (aheadOfSpine && now - last < minGapMs) {
        job.progress = Math.min(cap, Math.max(job.progress, spine))
        return
      }
      job.lastStreamProgressAtMs = now
      const d = Math.max(0, Math.round(delta))
      job.progress = Math.min(cap, Math.max(job.progress + d, spine))
    },
  }
}

const DOCKER_INSTALL_STEPS: Record<'ubuntu' | 'fedora' | 'arch', string[]> = {
  ubuntu: [
    'apt-get update && apt-get install -y ca-certificates curl && install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc',
    'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && apt-get update',
    'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
    'systemctl enable --now docker && docker --version',
  ],
  fedora: [
    'dnf -y install dnf-plugins-core && dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo',
    'dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
    'systemctl enable --now docker && docker --version',
  ],
  arch: [
    'pacman -S --needed --noconfirm docker docker-compose',
    'systemctl enable --now docker && docker --version',
  ],
}

let lastCpuIdle = 0
let lastCpuTotal = 0

function dockerSocketCandidates(): string[] {
  const run = process.env.XDG_RUNTIME_DIR
  return ['/var/run/docker.sock', ...(run ? [path.join(run, 'docker.sock')] : [])]
}

function getDocker(): Docker | null {
  if (docker) return docker
  for (const socketPath of dockerSocketCandidates()) {
    try {
      docker = new Docker({ socketPath })
      return docker
    } catch {
      /* next */
    }
  }
  return null
}

function detectHostDistroSync(): 'fedora' | 'ubuntu' | 'arch' {
  if (fs.existsSync('/etc/fedora-release')) return 'fedora'
  if (fs.existsSync('/etc/arch-release')) return 'arch'
  return 'ubuntu'
}

type RuntimeDetectResult = { installed: boolean; version?: string; path?: string }
type Distro = 'fedora' | 'ubuntu' | 'arch'

const RUNTIME_INSTALL_PACKAGES: Record<string, Record<Distro, string[]>> = {
  node: { fedora: ['nodejs'], ubuntu: ['nodejs'], arch: ['nodejs'] },
  rust: { fedora: ['rust'], ubuntu: ['rustc'], arch: ['rust'] },
  python: { fedora: ['python3'], ubuntu: ['python3'], arch: ['python'] },
  go: { fedora: ['golang'], ubuntu: ['golang'], arch: ['go'] },
  java: { fedora: ['java-latest-openjdk'], ubuntu: ['default-jdk'], arch: ['jdk-openjdk'] },
  php: { fedora: ['php'], ubuntu: ['php'], arch: ['php'] },
  ruby: { fedora: ['ruby'], ubuntu: ['ruby'], arch: ['ruby'] },
  dotnet: { fedora: ['dotnet-sdk-8.0'], ubuntu: ['dotnet-sdk-8.0'], arch: ['dotnet-sdk'] },
  zig: { fedora: ['zig'], ubuntu: ['zig'], arch: ['zig'] },
  c_cpp: { fedora: ['gcc', 'gcc-c++', 'gdb', 'make'], ubuntu: ['build-essential', 'gdb'], arch: ['base-devel', 'gdb'] },
  matlab: { fedora: ['octave'], ubuntu: ['octave'], arch: ['octave'] },
  dart: { fedora: ['dart'], ubuntu: ['dart'], arch: ['dart'] },
  flutter: { fedora: ['flutter'], ubuntu: ['flutter'], arch: ['flutter'] },
  julia: { fedora: ['julia'], ubuntu: ['julia'], arch: ['julia'] },
  lua: { fedora: ['lua'], ubuntu: ['lua5.4'], arch: ['lua'] },
  lisp: { fedora: ['sbcl'], ubuntu: ['sbcl'], arch: ['sbcl'] },
}

const RUNTIME_DEP_PACKAGES: Record<string, Record<Distro, string[]>> = {
  bun: { fedora: ['curl', 'unzip', 'bash'], ubuntu: ['curl', 'unzip', 'bash'], arch: ['curl', 'unzip', 'bash'] },
  java: { fedora: ['java-latest-openjdk', 'java-latest-openjdk-devel'], ubuntu: ['default-jdk'], arch: ['jdk-openjdk'] },
  rust: {
    fedora: ['curl', 'gcc-c++', 'make', 'pkgconf-pkg-config', 'openssl-devel'],
    ubuntu: ['curl', 'build-essential', 'pkg-config', 'libssl-dev'],
    arch: ['curl', 'base-devel', 'pkgconf', 'openssl'],
  },
  node: { fedora: ['nodejs', 'npm', 'gcc-c++', 'make'], ubuntu: ['nodejs', 'npm', 'build-essential'], arch: ['nodejs', 'npm', 'base-devel'] },
  c_cpp: { fedora: ['gcc', 'gcc-c++', 'gdb', 'make', 'cmake'], ubuntu: ['build-essential', 'gdb', 'cmake'], arch: ['base-devel', 'gdb', 'cmake'] },
  go: { fedora: ['golang'], ubuntu: ['golang'], arch: ['go'] },
  matlab: { fedora: ['octave'], ubuntu: ['octave'], arch: ['octave'] },
  dart: { fedora: ['dart'], ubuntu: ['dart'], arch: ['dart'] },
  flutter: { fedora: ['flutter'], ubuntu: ['flutter'], arch: ['flutter'] },
  julia: { fedora: ['julia'], ubuntu: ['julia'], arch: ['julia'] },
  lua: { fedora: ['lua', 'luarocks'], ubuntu: ['lua5.4', 'luarocks'], arch: ['lua', 'luarocks'] },
  lisp: { fedora: ['sbcl'], ubuntu: ['sbcl'], arch: ['sbcl'] },
  ruby: { fedora: ['ruby'], ubuntu: ['ruby'], arch: ['ruby'] },
}

const RUNTIME_DETECT_COMMANDS: Record<string, { cmd: string; args: string[]; name: string }> = {
  node: { cmd: 'node', args: ['--version'], name: 'Node.js' },
  rust: { cmd: 'rustc', args: ['--version'], name: 'Rust' },
  python: { cmd: 'python3', args: ['--version'], name: 'Python 3' },
  go: { cmd: 'go', args: ['version'], name: 'Go' },
  java: { cmd: 'java', args: ['-version'], name: 'Java' },
  php: { cmd: 'php', args: ['--version'], name: 'PHP' },
  ruby: { cmd: 'ruby', args: ['--version'], name: 'Ruby' },
  dotnet: { cmd: 'dotnet', args: ['--version'], name: '.NET SDK' },
  bun: { cmd: 'bun', args: ['--version'], name: 'Bun' },
  zig: { cmd: 'zig', args: ['version'], name: 'Zig' },
  c_cpp: { cmd: 'g++', args: ['--version'], name: 'C/C++ Toolchain' },
  matlab: { cmd: 'octave', args: ['--version'], name: 'MATLAB (Octave)' },
  dart: { cmd: 'dart', args: ['--version'], name: 'Dart' },
  flutter: { cmd: 'flutter', args: ['--version'], name: 'Flutter' },
  julia: { cmd: 'julia', args: ['--version'], name: 'Julia' },
  lua: { cmd: 'lua', args: ['-v'], name: 'Lua' },
  lisp: { cmd: 'sbcl', args: ['--version'], name: 'Lisp (SBCL)' },
}

function dependencyRemovalPlan(runtimeId: string, distro: Distro): { removable: string[]; blockedShared: string[] } {
  const runtimePackages = new Set((RUNTIME_INSTALL_PACKAGES[runtimeId]?.[distro] ?? []))
  const depCandidates = new Set((RUNTIME_DEP_PACKAGES[runtimeId]?.[distro] ?? []).filter((d) => !runtimePackages.has(d)))
  if (!depCandidates.size) return { removable: [], blockedShared: [] }
  const sharedByOthers = new Set<string>()
  for (const [rid, depByDistro] of Object.entries(RUNTIME_DEP_PACKAGES)) {
    if (rid === runtimeId) continue
    for (const dep of (depByDistro[distro] ?? [])) sharedByOthers.add(dep)
  }
  const removable = [...depCandidates].filter((dep) => !sharedByOthers.has(dep))
  const blockedShared = [...depCandidates].filter((dep) => sharedByOthers.has(dep))
  return { removable, blockedShared }
}

function compareSemverAsc(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

function compareSemverDesc(a: string, b: string): number {
  return compareSemverAsc(b, a)
}

/** Strip UI suffixes like " (LTS Iron)" and return a version string nvm/pyenv/go can consume. */
function normalizeRequestedVersion(runtimeId: string, rawVersion?: string): string {
  const raw = (rawVersion ?? 'latest').trim()
  if (!raw || raw.toLowerCase() === 'latest') return 'latest'

  if (runtimeId === 'node') {
    const base = raw.replace(/\s*\([^)]*\)\s*$/u, '').trim().replace(/^v/i, '')
    if (base.toLowerCase() === 'lts' || base.toLowerCase() === 'stable') return 'lts'
    const triple = base.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (triple) return `${triple[1]}.${triple[2]}.${triple[3]}`
    const duo = base.match(/^(\d+)\.(\d+)/)
    if (duo) return `${duo[1]}.${duo[2]}`
    const major = base.match(/^(\d{1,2})$/)
    if (major) return major[1]
    return 'lts'
  }

  if (runtimeId === 'go') {
    const base = raw.replace(/^go/i, '').replace(/\s*\([^)]*\)\s*$/u, '').trim()
    const triple = base.match(/^(\d+\.\d+\.\d+)/)
    if (triple) return triple[1]
    const duo = base.match(/^(\d+\.\d+)/)
    if (duo) return duo[1]
    return 'latest'
  }

  if (runtimeId === 'python') {
    const base = raw.replace(/\s*\([^)]*\)\s*$/u, '').trim()
    const triple = base.match(/^(\d+\.\d+\.\d+)/)
    if (triple) return triple[1]
    const duo = base.match(/^(\d+\.\d+)/)
    if (duo) return duo[1]
    return 'latest'
  }

  return raw
}

async function fetchNodeVersionsForPicker(): Promise<string[]> {
  const res = await fetch('https://nodejs.org/dist/index.json').then((r) => r.json()) as Array<{ version: string; lts: string | boolean }>
  const rows = res
    .map((row) => {
      const semver = row.version.replace(/^v/, '')
      const ltsName = row.lts && typeof row.lts === 'string' ? String(row.lts) : ''
      const label = ltsName ? `${semver} (LTS ${ltsName})` : semver
      return { semver, label }
    })
    .sort((x, y) => compareSemverDesc(x.semver, y.semver))

  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (seen.has(r.semver)) continue
    seen.add(r.semver)
    out.push(r.label)
    if (out.length >= 120) break
  }
  return out
}

async function fetchGoVersionsForPicker(): Promise<string[]> {
  const res = await fetch('https://go.dev/dl/?mode=json&include=all').then((r) => r.json()) as Array<{ version: string }>
  const versions = res
    .map((x) => x.version.replace(/^go/, ''))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort(compareSemverDesc)

  const seen = new Set<string>()
  const out: string[] = []
  for (const v of versions) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 120) break
  }
  return out
}

async function fetchPythonVersionsForPicker(): Promise<string[]> {
  const res = await fetch('https://endoflife.date/api/python.json').then((r) => r.json()) as Array<{ latest: string }>
  const versions = res
    .map((x) => x.latest)
    .filter((v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v))
    .sort(compareSemverDesc)
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of versions) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 50) break
  }
  return out
}

/** GitHub REST requires a User-Agent; without it many clients get an HTML error page instead of JSON. */
const GITHUB_JSON_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'LuminaDev/1.0 (Electron; runtime version picker)',
}

async function fetchGithubJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: GITHUB_JSON_HEADERS })
  const ct = (r.headers.get('content-type') ?? '').toLowerCase()
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`GitHub HTTP ${r.status}: ${body.slice(0, 160)}`)
  }
  if (!ct.includes('json')) {
    const body = await r.text()
    throw new Error(`GitHub non-JSON (${ct}): ${body.slice(0, 160)}`)
  }
  return (await r.json()) as T
}

/** Parse `3.13.0-77.0.dev` → `3.13.0`; ignore analyzer/meta branch tags. */
function parseDartSdkTripletFromGitTag(name: string): string {
  const n = name.trim()
  if (!/^\d/.test(n)) return ''
  if (/^(analyzer|meta|merge_|depends_on_|interpreter_|language_|pkg_|rollup_|ffi-|characters-|material_)/i.test(n)) {
    return ''
  }
  const m = n.match(/^(\d+\.\d+\.\d+)/)
  return m ? m[1] : ''
}

async function fetchDartSdkGitTagsPaged(maxPages = 8): Promise<Array<{ name: string }>> {
  const all: Array<{ name: string }> = []
  let nextUrl: string | null = 'https://api.github.com/repos/dart-lang/sdk/tags?per_page=100'
  for (let page = 0; page < maxPages && nextUrl; page++) {
    const r = await fetch(nextUrl, { headers: GITHUB_JSON_HEADERS })
    const ct = (r.headers.get('content-type') ?? '').toLowerCase()
    if (!r.ok || !ct.includes('json')) {
      const body = await r.text()
      throw new Error(`GitHub tags HTTP ${r.status}: ${body.slice(0, 160)}`)
    }
    const batch = (await r.json()) as Array<{ name: string }>
    all.push(...batch)
    nextUrl = null
    const link = r.headers.get('link')
    if (link) {
      const part = link.split(',').find((s) => /rel="next"/.test(s))
      const m = part?.match(/<([^>]+)>/)
      if (m) nextUrl = m[1]
    }
    if (batch.length < 100) break
  }
  return all
}

async function fetchBunVersionsForPicker(): Promise<string[]> {
  let res: Array<{ tag_name?: string }>
  try {
    res = await fetchGithubJson<Array<{ tag_name?: string }>>(
      'https://api.github.com/repos/oven-sh/bun/releases?per_page=100',
    )
  } catch {
    return ['canary', '1.2.2', '1.1.42', '1.0.36', '1.0.30', '1.0.0']
  }
  const tags = res
    .map((x) => {
      let t = (x.tag_name ?? '').trim()
      t = t.replace(/^bun-v?/i, '').replace(/^v/i, '')
      t = t.split('+')[0]
      const m = t.match(/^(\d+\.\d+\.\d+)/)
      return m ? m[1] : ''
    })
    .filter(Boolean)
    .sort(compareSemverDesc)
  const seen = new Set<string>()
  const numeric: string[] = []
  for (const t of tags) {
    if (seen.has(t)) continue
    seen.add(t)
    numeric.push(t)
    if (numeric.length >= 60) break
  }
  return numeric.length ? ['canary', ...numeric] : ['canary', '1.2.2', '1.1.42', '1.0.36']
}

async function resolveGoTarballVersion(requested: string): Promise<string> {
  const r = requested.trim()
  if (r === 'latest' || !r) {
    const text = await fetch('https://go.dev/VERSION?m=text').then((x) => x.text())
    const m = text.match(/go(\d+\.\d+\.\d+)/)
    return m ? m[1] : '1.22.2'
  }
  if (/^\d+\.\d+\.\d+$/.test(r)) return r
  if (/^\d+\.\d+$/.test(r)) {
    const all = await fetch('https://go.dev/dl/?mode=json&include=all').then((x) => x.json()) as Array<{ version: string }>
    const candidates = all
      .map((x) => x.version.replace(/^go/, ''))
      .filter((v) => v.startsWith(`${r}.`) && /^\d+\.\d+\.\d+$/.test(v))
      .sort(compareSemverDesc)
    return candidates[0] ?? r
  }
  return r
}

async function resolvePythonInstallVersion(requested: string): Promise<string> {
  if (requested !== 'latest' && /^\d+\.\d+/.test(requested)) return requested
  const rows = await fetch('https://endoflife.date/api/python.json').then((r) => r.json()) as Array<{ latest: string }>
  const sorted = rows
    .map((x) => x.latest)
    .filter((v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v))
    .sort(compareSemverDesc)
  return sorted[0] ?? '3.12.0'
}

/** endoflife.date: use `latest` when it looks like a normal semver (avoids odd legacy tags in the UI). */
async function fetchEolLatestVersions(product: string, max: number): Promise<string[]> {
  const res = await fetch(`https://endoflife.date/api/${product}.json`).then((r) => {
    if (!r.ok) throw new Error(`eol ${product}: ${r.status}`)
    return r.json()
  }) as Array<{ latest?: string }>
  const labels = res
    .map((x) => (typeof x.latest === 'string' ? x.latest : ''))
    .filter((v) => /^\d+\.\d+/.test(v))
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of labels.sort(compareSemverDesc)) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

async function fetchJavaVersionsForPicker(): Promise<string[]> {
  const j = await fetch(
    'https://api.adoptium.net/v3/info/release_versions?release_type=ga&page_size=80&sort_order=DESC&vendor=eclipse&image_type=jdk',
  ).then((r) => r.json()) as { versions?: Array<{ openjdk_version: string; optional?: string }> }
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of j.versions ?? []) {
    const label = `${v.openjdk_version}${v.optional === 'LTS' ? ' (LTS)' : ''}`
    if (seen.has(label)) continue
    seen.add(label)
    out.push(label)
    if (out.length >= 60) break
  }
  return out
}

async function fetchDotnetSdkVersionsForPicker(): Promise<string[]> {
  const idx = await fetch('https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json').then((r) =>
    r.json(),
  ) as {
    'releases-index'?: Array<{
      'channel-version': string
      'latest-sdk': string
      'release-type'?: string
      'support-phase'?: string
      'latest-release'?: string
    }>
  }
  const rows = idx['releases-index'] ?? []
  const sorted = [...rows].sort((a, b) => {
    const na = Number.parseFloat(a['channel-version'] ?? '0')
    const nb = Number.parseFloat(b['channel-version'] ?? '0')
    return nb - na
  })

  const out: string[] = []
  for (const r of sorted) {
    const ch = r['channel-version']
    const sdk = r['latest-sdk']
    const rel = r['release-type'] ?? ''
    const phase = r['support-phase'] ?? ''
    if (!ch || !sdk) continue
    if (/preview/i.test(sdk) || /preview/i.test(r['latest-release'] ?? '')) continue
    out.push(`${ch} · SDK ${sdk} · ${rel.toUpperCase()}${phase ? ` · ${phase}` : ''}`)
    if (out.length >= 45) break
  }
  return out
}

async function fetchJuliaVersionsForPicker(): Promise<string[]> {
  const releases = await fetchGithubJson<Array<{ tag_name?: string }>>(
    'https://api.github.com/repos/JuliaLang/julia/releases?per_page=100',
  )
  const tags = releases
    .map((x) => {
      const raw = (x.tag_name ?? '').replace(/^v/i, '').split('+')[0]
      const m = raw.match(/^(\d+\.\d+\.\d+)/)
      return m ? m[1] : ''
    })
    .filter(Boolean)
    .sort(compareSemverDesc)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 80) break
  }
  if (out.length === 0) return await fetchEolLatestVersions('julia', 25)
  return out
}

async function fetchFlutterLinuxVersionsForPicker(): Promise<string[]> {
  const data = await fetch('https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json').then((r) =>
    r.json(),
  ) as { releases?: Array<{ channel?: string; version?: string }> }
  const stable = (data.releases ?? []).filter((x) => x.channel === 'stable' && x.version && !String(x.version).includes('pre'))
  const versions = stable
    .map((x) => String(x.version))
    .sort(compareSemverDesc)
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of versions) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 55) break
  }
  return out
}

async function fetchDartSdkVersionsForPicker(): Promise<string[]> {
  /** dart-lang/sdk does not publish GitHub Releases; SDK versions live as git tags (`3.5.4`, `3.13.0-77.0.dev`, …). */
  const tagRows = await fetchDartSdkGitTagsPaged(10)
  const triplets = tagRows
    .map((row) => parseDartSdkTripletFromGitTag(row.name))
    .filter(Boolean)
    .sort(compareSemverDesc)
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of triplets) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 80) break
  }
  if (out.length === 0) throw new Error('No Dart x.y.z tags parsed from dart-lang/sdk git tags')
  return out
}

async function detectRuntimeInstallation(id: string, cmd: string, args: string[]): Promise<RuntimeDetectResult & { allVersions?: Array<{ version: string; path: string }> }> {
  const home = homedir()
  const localPaths: Record<string, string[]> = {
    rust: [`${home}/.cargo/bin/rustc`, '/usr/bin/rustc'],
    bun: [`${home}/.bun/bin/bun`, `${home}/.local/bin/bun`, '/usr/local/bin/bun'],
    node: [`${home}/.nvm/versions/node/v*/bin/node`, `${home}/.local/bin/node`, `${home}/.lumina/runtimes/node/bin/node`, '/usr/bin/node'],
    go: [`${home}/go/bin/go`, `${home}/.lumina/runtimes/go/bin/go`, '/usr/bin/go'],
    python: [`${home}/.pyenv/shims/python3`, `${home}/.pyenv/shims/python`, '/usr/bin/python3'],
  }

  const allVersions: Array<{ version: string; path: string }> = []
  
  // 1. Check global
  await new Promise<void>((resolve) => {
    execFile(cmd, args, (err, stdout) => {
      if (!err) {
        const version = stdout.trim().split('\n')[0].replace(/^v/, '')
        execFile('which', [cmd], (_errW, outW) => {
          const p = outW.trim()
          if (p) allVersions.push({ version, path: p })
          resolve()
        })
      } else {
        resolve()
      }
    })
  })

  // 2. Check locals
  const paths = localPaths[id] || []
  for (const p of paths) {
    if (p.includes('*')) {
       const base = p.split('*')[0]
       if (fs.existsSync(base)) {
         try {
           const dirs = fs.readdirSync(base)
           for (const d of dirs) {
              const full = p.replace('*', d)
              if (fs.existsSync(full)) {
                 await new Promise<void>(res => {
                   execFile(full, args, (err, stdout) => {
                     if (!err) allVersions.push({ version: stdout.trim().split('\n')[0].replace(/^v/, ''), path: full })
                     res()
                   })
                 })
              }
           }
         } catch { /* ignore dir read errors */ }
       }
       continue
    }

    if (!fs.existsSync(p)) continue
    await new Promise<void>((resolve) => {
      execFile(p, args, (err, stdout) => {
        if (!err) allVersions.push({ version: stdout.trim().split('\n')[0].replace(/^v/, ''), path: p })
        resolve()
      })
    })
  }

  const unique = Array.from(new Map(allVersions.map(v => [v.path, v])).values())
  if (unique.length > 0) {
    return { installed: true, version: unique[0].version, path: unique[0].path, allVersions: unique }
  }
  return { installed: false }
}

function profileComposeDir(profile: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'docker-profiles', 'compose', profile)
  }
  return path.resolve(app.getAppPath(), '..', '..', 'docker', 'compose', profile)
}

function recentReposPath(): string {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

function dashboardLayoutPath(): string {
  return path.join(app.getPath('userData'), 'dashboard-layout.json')
}

function getSessionInfo(): SessionInfo {
  const flatpakId = process.env.FLATPAK_ID
  if (flatpakId) {
    return {
      kind: 'flatpak',
      flatpakId,
      summary:
        'Flatpak sandbox: Docker socket and host paths need explicit overrides; user-level installers (rustup, nvm) work best inside the home directory.',
    }
  }
  return {
    kind: 'native',
    summary: 'Native session: the app runs with your user permissions; system-wide changes may still need sudo or PolicyKit.',
  }
}

async function readDashboardLayout(): Promise<DashboardLayoutFile> {
  try {
    const raw = await readFile(dashboardLayoutPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return DashboardLayoutFileSchema.parse(parsed)
  } catch {
    return defaultDashboardLayout()
  }
}

async function writeDashboardLayout(layout: DashboardLayoutFile): Promise<void> {
  for (const p of layout.placements) {
    if (!isRegisteredWidgetType(p.widgetTypeId)) {
      throw new Error(`Unknown widget type: ${p.widgetTypeId}`)
    }
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(dashboardLayoutPath(), JSON.stringify(layout, null, 2))
}

function pruneFinishedJobs(): void {
  if (jobs.size < 25) return
  for (const [id, j] of jobs) {
    if (j.state !== 'running') {
      jobs.delete(id)
      return
    }
  }
}

async function execTarget(target: 'sandbox' | 'host', cmd: string, args: string[]): Promise<string> {
  const isFlatpak = !!process.env.FLATPAK_ID
  let execCmd = cmd
  let execArgs = args
  if (target === 'host' && isFlatpak) {
    execCmd = 'flatpak-spawn'
    execArgs = ['--host', cmd, ...args]
  }
  return new Promise((resolve, reject) => {
    execFile(execCmd, execArgs, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

function jobToSummary(j: JobRecord): JobSummary {
  return {
    id: j.id,
    kind: j.kind,
    state: j.state,
    progress: j.progress,
    logTail: j.log.slice(-12),
  }
}

async function loadRecentRepos(): Promise<GitRepoEntry[]> {
  try {
    const raw = await readFile(recentReposPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is GitRepoEntry => {
        return (
          x !== null &&
          typeof x === 'object' &&
          'path' in x &&
          typeof (x as GitRepoEntry).path === 'string' &&
          'lastOpened' in x &&
          typeof (x as GitRepoEntry).lastOpened === 'number'
        )
      })
      .sort((a, b) => b.lastOpened - a.lastOpened)
  } catch {
    return []
  }
}

async function saveRecentRepos(entries: GitRepoEntry[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(recentReposPath(), JSON.stringify(entries.slice(0, 20), null, 2))
}

function assertAllowedWritePath(target: string): string {
  const resolved = path.resolve(target)
  const home = homedir()
  const safe =
    resolved === home ||
    resolved.startsWith(home + path.sep) ||
    resolved.startsWith(tmpdir() + path.sep)
  if (!safe) {
    throw new Error('Path must resolve under your home directory or temp.')
  }
  return resolved
}

async function appendToShellProfile(binPath: string): Promise<string[]> {
  const home = homedir()
  const profiles = ['.bashrc', '.zshrc', '.profile', '.bash_profile']
  const logs: string[] = []
  const exportLine = `\n# LuminaDev: added bin path\nexport PATH="${binPath}:$PATH"\n`

  for (const p of profiles) {
    const fullPath = path.join(home, p)
    if (fs.existsSync(fullPath)) {
      try {
        const content = await readFile(fullPath, 'utf8')
        if (!content.includes(binPath)) {
          await fs.promises.appendFile(fullPath, exportLine)
          logs.push(`Updated ${p}: added ${binPath} to PATH.`)
        } else {
          logs.push(`Skipped ${p}: path already exists.`)
        }
      } catch (err) {
        logs.push(`Error updating ${p}: ${String(err)}`)
      }
    }
  }
  return logs
}

async function runSmokeTest(runtimeId: string, cmd: string): Promise<{ ok: boolean; output: string }> {
  const testCodes: Record<string, string> = {
    node: `console.log("ok")`,
    python: `print("ok")`,
    go: `package main; import "fmt"; func main() { fmt.Println("ok") }`,
    rust: `fn main() { println!("ok"); }`,
    bun: `console.log("ok")`,
    php: `echo "ok";`,
    ruby: `puts "ok"`,
    lua: `print("ok")`,
  }

  const code = testCodes[runtimeId]
  if (!code) return { ok: true, output: `[smoke:${runtimeId}] skipped (no harness)` }

  return new Promise((resolve) => {
    let process: ReturnType<typeof spawn>
    if (runtimeId === 'go') {
       const tmpFile = path.join(tmpdir(), `test_${randomUUID()}.go`)
       fs.writeFileSync(tmpFile, code)
       process = spawn(cmd, ['run', tmpFile])
    } else if (runtimeId === 'rust') {
       const tmpFile = path.join(tmpdir(), `test_${randomUUID()}.rs`)
       const binFile = path.join(tmpdir(), `test_${randomUUID()}`)
       fs.writeFileSync(tmpFile, code)
       execFile('rustc', [tmpFile, '-o', binFile], (err) => {
         if (err) return resolve({ ok: false, output: `[smoke:rust] build failed: ${err.message}` })
         execFile(binFile, (err2, stdout) => {
            const out = stdout.trim()
            resolve({
              ok: !err2 && out === 'ok',
              output: err2 ? `[smoke:rust] run failed: ${err2.message}` : `[smoke:rust] ${out}`,
            })
         })
       })
       return
    } else {
      let flags = ['-c', code]
      if (runtimeId === 'node' || runtimeId === 'bun') flags = ['-e', code]
      if (runtimeId === 'php') flags = ['-r', code]
      if (runtimeId === 'ruby' || runtimeId === 'lua' || runtimeId === 'python') flags = ['-c', code] 
      // Actually python -c is correct. Ruby is -e.
      if (runtimeId === 'ruby') flags = ['-e', code]
      if (runtimeId === 'lua') flags = ['-e', code]
      
      process = spawn(cmd, flags)
    }

    let out = ''
    process.stdout?.on('data', (d) => (out += d.toString()))
    process.on('close', (code) => {
      const tail = out.trim()
      resolve({
        ok: code === 0 && tail.includes('ok'),
        output: `[smoke:${runtimeId}] exit=${code ?? 'n/a'} out=${tail.slice(0, 120)}`,
      })
    })
    process.on('error', (err) => resolve({ ok: false, output: `[smoke:${runtimeId}] ${err.message}` }))
  })
}

function sampleCpuUsage(): number {
  let idle = 0
  let tot = 0
  for (const c of cpus()) {
    idle += c.times.idle
    tot +=
      c.times.user +
      c.times.nice +
      c.times.sys +
      c.times.idle +
      c.times.irq +
      ('softirq' in c.times ? (c.times as { softirq: number }).softirq : 0)
  }
  const di = idle - lastCpuIdle
  const dt = tot - lastCpuTotal
  lastCpuIdle = idle
  lastCpuTotal = tot
  if (dt <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(100 * (1 - di / dt))))
}

let netPrev: { t: number; rx: number; tx: number } | null = null
let diskPrev: { t: number; readBytes: number; writeBytes: number } | null = null

function readNetAgg(): { rx: number; tx: number } {
  try {
    const lines = readFileSync('/proc/net/dev', 'utf8').split('\n')
    let rx = 0
    let tx = 0
    for (const line of lines) {
      if (!line.includes(':')) continue
      const [iface, rest] = line.split(':')
      const name = iface.trim()
      if (name === 'lo') continue
      const parts = rest.trim().split(/\s+/).map(Number)
      if (parts.length < 9) continue
      rx += parts[0] ?? 0
      tx += parts[8] ?? 0
    }
    return { rx, tx }
  } catch {
    return { rx: 0, tx: 0 }
  }
}

function netMbps(): { rx: number; tx: number } {
  const cur = readNetAgg()
  const t = Date.now()
  if (!netPrev) {
    netPrev = { t, ...cur }
    return { rx: 0, tx: 0 }
  }
  const dt = (t - netPrev.t) / 1000
  if (dt <= 0.2) return { rx: 0, tx: 0 }
  const rxBytes = cur.rx - netPrev.rx
  const txBytes = cur.tx - netPrev.tx
  netPrev = { t, ...cur }
  const toMbps = (b: number) => Math.max(0, (b * 8) / (dt * 1_000_000))
  return { rx: toMbps(rxBytes), tx: toMbps(txBytes) }
}

function readDiskIoAgg(): { readBytes: number; writeBytes: number } {
  try {
    const lines = readFileSync('/proc/diskstats', 'utf8').split('\n').filter(Boolean)
    let readSectors = 0
    let writeSectors = 0
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 14) continue
      const name = parts[2] ?? ''
      if (/^(loop|ram|zram|dm-)/.test(name)) continue
      readSectors += Number(parts[5] ?? 0)
      writeSectors += Number(parts[9] ?? 0)
    }
    return { readBytes: readSectors * 512, writeBytes: writeSectors * 512 }
  } catch {
    return { readBytes: 0, writeBytes: 0 }
  }
}

function diskIoMbps(): { readMbps: number; writeMbps: number } {
  const cur = readDiskIoAgg()
  const t = Date.now()
  if (!diskPrev) {
    diskPrev = { t, ...cur }
    return { readMbps: 0, writeMbps: 0 }
  }
  const dt = (t - diskPrev.t) / 1000
  if (dt <= 0.2) return { readMbps: 0, writeMbps: 0 }
  const readDelta = Math.max(0, cur.readBytes - diskPrev.readBytes)
  const writeDelta = Math.max(0, cur.writeBytes - diskPrev.writeBytes)
  diskPrev = { t, ...cur }
  const toMbps = (b: number) => (b * 8) / (dt * 1_000_000)
  return { readMbps: toMbps(readDelta), writeMbps: toMbps(writeDelta) }
}

async function systemdRow(unitBase: string): Promise<SystemdRow> {
  const name = `${unitBase}.service`
  return await new Promise((resolveRow) => {
    execFile('systemctl', ['is-active', name], { timeout: 2000 }, (err, stdout) => {
      const out = (stdout ?? '').trim()
      if (!err && out === 'active') {
        resolveRow({ name, state: 'active' })
        return
      }
      if (out === 'failed') {
        resolveRow({ name, state: 'failed' })
        return
      }
      if (out === 'inactive' || out === 'deactivated') {
        resolveRow({ name, state: 'inactive' })
        return
      }
      resolveRow({ name, state: 'unknown' })
    })
  })
}

async function collectMetrics(): Promise<HostMetricsResponse> {
  const freeMb = Math.round(freemem() / (1024 * 1024))
  const totalMb = Math.round(totalmem() / (1024 * 1024))
  let swapTotalMb = 0
  let swapFreeMb = 0
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8')
    const swapTotal = meminfo.match(/^SwapTotal:\s+(\d+)\s+kB$/m)
    const swapFree = meminfo.match(/^SwapFree:\s+(\d+)\s+kB$/m)
    swapTotalMb = swapTotal ? Math.round(Number(swapTotal[1]) / 1024) : 0
    swapFreeMb = swapFree ? Math.round(Number(swapFree[1]) / 1024) : 0
  } catch {
    /* non-linux or restricted */
  }
  let diskTotalGb = 0
  let diskFreeGb = 0
  try {
    const s = statfsSync('/')
    const bs = Number(s.bsize)
    diskTotalGb = Math.round(((s.blocks * bs) / 1024 ** 3) * 10) / 10
    diskFreeGb = Math.round(((s.bfree * bs) / 1024 ** 3) * 10) / 10
  } catch {
    /* sandbox */
  }
  const { rx, tx } = netMbps()
  const { readMbps, writeMbps } = diskIoMbps()
  const model = cpus()[0]?.model ?? 'CPU'
  const metrics: HostMetrics = {
    cpuUsagePercent: sampleCpuUsage(),
    cpuModel: model,
    loadAvg: loadavg(),
    totalMemMb: totalMb,
    freeMemMb: freeMb,
    swapTotalMb,
    swapFreeMb,
    uptimeSec: Math.round(uptime()),
    diskTotalGb,
    diskFreeGb,
    netRxMbps: rx,
    netTxMbps: tx,
    diskReadMbps: readMbps,
    diskWriteMbps: writeMbps,
  }
  const systemd = await Promise.all(SYSTEMD_UNITS.map((u) => systemdRow(u)))
  return { metrics, systemd }
}

function formatPorts(ports: Docker.Port[]): string {
  if (!ports?.length) return '—'
  return ports
    .map((p) => {
      const pub = p.PublicPort
      const priv = p.PrivatePort
      if (pub) return `${pub}:${priv}/${p.Type}`
      return `${priv}/${p.Type}`
    })
    .slice(0, 4)
    .join(', ')
}

async function listContainers(): Promise<
  { ok: true; rows: ContainerRow[] } | { ok: false; error: string }
> {
  const d = getDocker()
  if (!d) {
    return {
      ok: false,
      error:
        'Docker socket not available. See docs/DOCKER_FLATPAK.md for Flatpak permissions.',
    }
  }
  try {
    const list = await d.listContainers({ all: true })
    const rows: ContainerRow[] = list.map((c) => {
      const name = (c.Names?.[0] ?? '').replace(/^\//, '') || c.Id.slice(0, 8)
      const networks = c.NetworkSettings?.Networks
        ? Object.keys(c.NetworkSettings.Networks)
        : []
      const volumes = (c.Mounts ?? [])
        .filter((m) => m.Type === 'volume' && !!m.Name)
        .map((m) => m.Name as string)
      return {
        id: c.Id,
        name,
        image: c.Image,
        imageId: c.ImageID,
        state: c.State,
        status: c.Status,
        ports: formatPorts(c.Ports ?? []),
        networks,
        volumes,
      }
    })
    return { ok: true, rows }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

async function dockerPublishedHostPorts(): Promise<HostPortRow[]> {
  const d = getDocker()
  if (!d) return []
  try {
    const containers = await d.listContainers({ all: false })
    const rows: HostPortRow[] = []
    for (const c of containers) {
      const containerName = (c.Names?.[0] ?? c.Image ?? 'container').replace(/^\//, '')
      for (const p of (c.Ports ?? [])) {
        const publicPort = p.PublicPort
        if (!Number.isFinite(publicPort) || !publicPort || publicPort <= 0) continue
        rows.push({
          protocol: p.Type === 'udp' ? 'udp' : 'tcp',
          port: publicPort,
          state: 'LISTEN',
          service: `docker:${containerName}`,
        })
      }
    }
    return rows
  } catch {
    return []
  }
}

function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function registerIpc(): void {
  ipcMain.handle(IPC.dockerList, async () => await listContainers())

  ipcMain.handle(IPC.dockerAction, async (_e, raw: unknown) => {
    const body = raw as DockerActionPayload
    const act = DockerContainerActionSchema.safeParse(body?.action)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id || !act.success) throw new Error('Invalid docker action')
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const container = d.getContainer(id)
    if (act.data === 'start') await container.start()
    else if (act.data === 'stop') await container.stop({ t: 2 })
    else if (act.data === 'restart') await container.restart()
    else await container.remove({ force: true })
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerLogs, async (_e, raw: unknown) => {
    const req = DockerLogsRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const container = d.getContainer(req.id)
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      tail: req.tail ?? 200,
      timestamps: false,
    })
    const buf = Buffer.isBuffer(stream) ? stream : Buffer.from(stream as ArrayBuffer)
    return buf.toString('utf8')
  })

  ipcMain.handle(IPC.dockerCreate, async (_e, raw: unknown) => {
    const req = DockerCreateRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const cmd = req.command?.trim() ? req.command.trim().split(/\s+/) : undefined
    const exposedPorts =
      req.ports && req.ports.length > 0
        ? Object.fromEntries(req.ports.map((p) => [`${p.containerPort}/${p.protocol ?? 'tcp'}`, {}]))
        : undefined
    const portBindings =
      req.ports && req.ports.length > 0
        ? Object.fromEntries(
            req.ports.map((p) => [
              `${p.containerPort}/${p.protocol ?? 'tcp'}`,
              [{ HostPort: String(p.hostPort) }],
            ])
          )
        : undefined
    const binds =
      req.volumes && req.volumes.length > 0
        ? req.volumes.map((v) => {
            const hostPath = path.isAbsolute(v.hostPath)
              ? v.hostPath
              : path.resolve(process.cwd(), v.hostPath)
            return `${hostPath}:${v.containerPath}`
          })
        : undefined
    const createPayload = {
      Image: req.image,
      name: req.name,
      Cmd: cmd,
      Env: req.env,
      ExposedPorts: exposedPorts,
      Tty: true,
      OpenStdin: false,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds,
        RestartPolicy: { Name: 'unless-stopped' as const },
      },
    }
    let container: Docker.Container
    try {
      container = await d.createContainer(createPayload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/No such image/i.test(msg)) throw e
      // If image is missing locally, pull it once and retry create.
      const stream = await d.pull(req.image)
      await new Promise<void>((resolvePull, rejectPull) => {
        d.modem.followProgress(stream, (err) => {
          if (err) rejectPull(err)
          else resolvePull()
        })
      })
      container = await d.createContainer(createPayload)
    }
    if (req.autoStart ?? true) {
      await container.start()
    }
    return { ok: true, id: container.id }
  })

  ipcMain.handle(IPC.dockerPull, async (_e, raw: unknown) => {
    const req = DockerPullRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const stream = await d.pull(req.image)
    await new Promise<void>((resolvePull, rejectPull) => {
      d.modem.followProgress(stream, (err) => {
        if (err) rejectPull(err)
        else resolvePull()
      })
    })
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerRemapPort, async (_e, raw: unknown) => {
    const req = DockerRemapPortRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const src = d.getContainer(req.id)
    const info = await src.inspect()
    const image = info.Config?.Image
    if (!image) throw new Error('Container image is missing')
    const oldName = info.Name?.replace(/^\//, '') || `container-${req.id.slice(0, 8)}`
    const newName = `${oldName}-p${req.newHostPort}`
    const oldBindings = info.HostConfig?.PortBindings ?? {}
    const newBindings: Record<string, Array<{ HostPort: string }>> = {}
    for (const [key, arr] of Object.entries(oldBindings)) {
      const bindingRows = Array.isArray(arr) ? (arr as Array<{ HostPort?: string }>) : []
      const next = bindingRows.map((b) => {
        if (Number(b.HostPort) === req.oldHostPort) return { HostPort: String(req.newHostPort) }
        return { HostPort: String(b.HostPort ?? '') }
      })
      newBindings[key] = next
    }
    const clone = await d.createContainer({
      Image: image,
      name: newName,
      Cmd: info.Config?.Cmd ?? undefined,
      Env: info.Config?.Env ?? undefined,
      ExposedPorts: info.Config?.ExposedPorts ?? undefined,
      Tty: Boolean(info.Config?.Tty),
      OpenStdin: Boolean(info.Config?.OpenStdin),
      HostConfig: {
        ...info.HostConfig,
        PortBindings: newBindings,
      },
    })
    await clone.start()
    return { ok: true, id: clone.id, name: newName }
  })

  ipcMain.handle(IPC.dockerImagesList, async () => {
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const list = await d.listImages({ all: true })
    const rows: ImageRow[] = list.map((img) => ({
      id: img.Id,
      repoTags: Array.isArray(img.RepoTags) && img.RepoTags.length > 0 ? img.RepoTags : ['<none>:<none>'],
      sizeMb: Math.round((((img.Size ?? 0) as number) / (1024 * 1024)) * 10) / 10,
      createdAt: ((img.Created ?? 0) as number) * 1000,
    }))
    return { ok: true, rows }
  })

  ipcMain.handle(IPC.dockerImageAction, async (_e, raw: unknown) => {
    const req = DockerImageActionRequestSchema.parse(raw as DockerImageActionPayload)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    if (req.action !== 'remove') throw new Error('Unsupported image action')
    await d.getImage(req.id).remove({ force: req.force ?? false })
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerVolumesList, async () => {
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const list = await d.listVolumes()
    const containers = await d.listContainers({ all: true })
    const usage = new Map<string, Set<string>>()
    for (const c of containers) {
      const cName = (c.Names?.[0] ?? '').replace(/^\//, '') || c.Id.slice(0, 12)
      for (const m of c.Mounts ?? []) {
        if (m.Type !== 'volume' || !m.Name) continue
        if (!usage.has(m.Name)) usage.set(m.Name, new Set<string>())
        usage.get(m.Name)?.add(cName)
      }
    }
    const rows: VolumeRow[] = (list.Volumes ?? []).map((v) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      scope: v.Scope,
      usedBy: Array.from(usage.get(v.Name) ?? []),
    }))
    return { ok: true, rows }
  })

  ipcMain.handle(IPC.dockerVolumeAction, async (_e, raw: unknown) => {
    const req = DockerVolumeActionRequestSchema.parse(raw as DockerVolumeActionPayload)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    if (req.action !== 'remove') throw new Error('Unsupported volume action')
    await d.getVolume(req.name).remove()
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerVolumeCreate, async (_e, raw: unknown) => {
    const { name } = DockerVolumeCreateRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    await d.createVolume({ Name: name })
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerNetworksList, async () => {
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const list = await d.listNetworks()
    const containers = await d.listContainers({ all: true })
    const usage = new Map<string, Set<string>>()
    for (const c of containers) {
      const cName = (c.Names?.[0] ?? '').replace(/^\//, '') || c.Id.slice(0, 12)
      for (const netName of Object.keys(c.NetworkSettings?.Networks ?? {})) {
        if (!usage.has(netName)) usage.set(netName, new Set<string>())
        usage.get(netName)?.add(cName)
      }
    }
    const rows: NetworkRow[] = list.map((n) => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      usedBy: Array.from(usage.get(n.Name) ?? []),
    }))
    return { ok: true, rows }
  })

  ipcMain.handle(IPC.dockerNetworkAction, async (_e, raw: unknown) => {
    const req = DockerNetworkActionRequestSchema.parse(raw as DockerNetworkActionPayload)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    if (req.action !== 'remove') throw new Error('Unsupported network action')
    await d.getNetwork(req.id).remove()
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerNetworkCreate, async (_e, raw: unknown) => {
    const { name } = DockerNetworkCreateRequestSchema.parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    await d.createNetwork({ Name: name })
    return { ok: true }
  })

  ipcMain.handle(IPC.dockerPrune, async (_e, raw: unknown) => {
    const selection = z
      .object({
        containers: z.boolean().optional().default(true),
        images: z.boolean().optional().default(true),
        volumes: z.boolean().optional().default(true),
        networks: z.boolean().optional().default(true),
      })
      .parse(raw ?? {})
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')

    let reclaimed = 0
    if (selection.containers) {
      const res = await d.pruneContainers()
      reclaimed += Number(res.SpaceReclaimed || 0)
    }
    if (selection.images) {
      const res = await d.pruneImages()
      reclaimed += Number(res.SpaceReclaimed || 0)
    }
    if (selection.volumes) {
      const res = await d.pruneVolumes()
      reclaimed += Number(res.SpaceReclaimed || 0)
    }
    if (selection.networks) {
      await d.pruneNetworks()
    }

    return {
      ok: true,
      reclaimedBytes: reclaimed,
    }
  })

  ipcMain.handle(IPC.dockerPrunePreview, async () => {
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    const [containers, images, volumes, networks] = await Promise.all([
      d.listContainers({ all: true }),
      d.listImages({ all: true, filters: { dangling: ['true'] } }),
      d.listVolumes(),
      d.listNetworks(),
    ])
    const stoppedCount = containers.filter((c) => c.State !== 'running').length
    const volumeUnused = (volumes.Volumes ?? []).filter((v) => (v.UsageData?.RefCount ?? 0) === 0).length
    const networkUnused = networks.filter((n) => {
      const isSystem = n.Name === 'bridge' || n.Name === 'host' || n.Name === 'none'
      return !isSystem && (n.Containers ? Object.keys(n.Containers).length === 0 : true)
    }).length
    return {
      ok: true,
      preview: {
        containers: stoppedCount,
        images: images.length,
        volumes: volumeUnused,
        networks: networkUnused,
      },
    }
  })

  ipcMain.handle(IPC.dockerCleanupRun, async (_e, raw: unknown) => {
    const req = z
      .object({
        containers: z.boolean().optional().default(false),
        images: z.boolean().optional().default(false),
        volumes: z.boolean().optional().default(false),
        networks: z.boolean().optional().default(false),
      })
      .parse(raw)
    const d = getDocker()
    if (!d) throw new Error('Docker unavailable')
    let reclaimedBytes = 0
    if (req.containers) {
      const res = await d.pruneContainers()
      reclaimedBytes += Number(res.SpaceReclaimed ?? 0)
    }
    if (req.images) {
      const res = await d.pruneImages()
      reclaimedBytes += Number(res.SpaceReclaimed ?? 0)
    }
    if (req.volumes) {
      const res = await d.pruneVolumes()
      reclaimedBytes += Number(res.SpaceReclaimed ?? 0)
    }
    if (req.networks) {
      await d.pruneNetworks()
    }
    return { ok: true, reclaimedBytes }
  })

  ipcMain.handle(IPC.dockerCheckInstalled, async () => {
    const check = (cmd: string) => new Promise<boolean>(res => {
      execFile('which', [cmd], (err) => res(!err))
    })
    const checkPlugin = (plugin: string) => new Promise<boolean>(res => {
      execFile('docker', [plugin, 'version'], (err) => res(!err))
    })

    const hasDocker = await check('docker')
    const hasCompose = await check('docker-compose') || await checkPlugin('compose')
    const hasBuildx = await checkPlugin('buildx')

    return { docker: hasDocker, compose: hasCompose, buildx: hasBuildx }
  })

  ipcMain.handle(IPC.dockerInstall, async (_e, { distro, password, components }: { distro: 'ubuntu' | 'fedora' | 'arch'; password?: string; components?: string[] }) => {
    const baseSteps = DOCKER_INSTALL_STEPS[distro]
    if (!baseSteps) throw new Error('Unsupported distro')

    const logs: string[] = []
    const execWithSudo = (cmd: string) => {
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const fullCmd = `sudo -S bash -c "${cmd}"`
        const proc = spawn('sh', ['-c', fullCmd])

        if (password) {
          proc.stdin.write(`${password}\n`)
        }

        proc.stdout.on('data', (d) => logs.push(`OUT: ${d.toString().trim()}`))
        proc.stderr.on('data', (d) => {
          const s = d.toString()
          if (!s.includes('[sudo] password for')) {
            logs.push(`ERR: ${s.trim()}`)
          }
        })

        proc.on('close', (code) => {
          if (code === 0) resolve({ ok: true })
          else resolve({ ok: false, error: `Command failed with code ${code}` })
        })
      })
    }

    // Filter packages based on components if provided
    let steps = [...baseSteps]
    if (components && components.length > 0) {
      if (distro === 'ubuntu' || distro === 'fedora') {
        const pkgCmd = distro === 'ubuntu' ? 'apt-get install -y' : 'dnf install -y'
        const packages: string[] = []
        if (components.includes('docker')) packages.push('docker-ce', 'docker-ce-cli', 'containerd.io')
        if (components.includes('compose')) packages.push('docker-compose-plugin')
        if (components.includes('buildx')) packages.push('docker-buildx-plugin')
        
        steps = steps.map(s => {
          if (s.includes('install -y docker-ce')) {
             return `${pkgCmd} ${packages.join(' ')}`
          }
          return s
        })
      } else if (distro === 'arch') {
        const packages: string[] = []
        if (components.includes('docker')) packages.push('docker')
        if (components.includes('compose')) packages.push('docker-compose')
        
        steps = steps.map(s => {
          if (s.includes('pacman -S')) {
             return `pacman -S --needed --noconfirm ${packages.join(' ')}`
          }
          return s
        })
      }
    }

    for (const cmd of steps) {
      logs.push(`RUNNING: ${cmd}`)
      const res = await execWithSudo(cmd)
      if (!res.ok) {
        return { ok: false, log: logs, error: res.error }
      }
    }

    return { ok: true, log: logs }
  })

  ipcMain.handle(IPC.getHostDistro, async () => {
    try {
      const content = await readFile('/etc/os-release', 'utf8')
      const idMatch = content.match(/^ID=(.*)$/m)
      const idLikeMatch = content.match(/^ID_LIKE=(.*)$/m)
      const id = idMatch ? idMatch[1].replace(/"/g, '').toLowerCase() : ''
      const idLike = idLikeMatch ? idLikeMatch[1].replace(/"/g, '').toLowerCase() : ''

      if (id === 'fedora' || idLike.includes('fedora')) return 'fedora'
      if (id === 'ubuntu' || id === 'debian' || idLike.includes('ubuntu') || idLike.includes('debian')) return 'ubuntu'
      if (id === 'arch' || idLike.includes('arch')) return 'arch'
      return id || 'unknown'
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle(IPC.dockerSearch, async (_e, term: string) => {
    if (!docker || !term) return []
    try {
      const results = (await docker.searchImages({ term })) as Array<{
        name: string
        description: string
        star_count: number
        is_official: boolean
      }>
      return results.map((r) => ({
        name: r.name,
        description: r.description,
        star_count: r.star_count,
        is_official: r.is_official
      }))
    } catch (err) {
      console.error('Docker search error:', err)
      return []
    }
  })

  ipcMain.handle(IPC.dockerGetTags, async (_e, image: string) => {
    if (!image) return []
    const parts = image.split('/')
    const fullImage = parts.length === 1 ? `library/${image}` : image
    try {
      const url = `https://hub.docker.com/v2/repositories/${fullImage}/tags?page_size=100`
      const resp = await fetch(url)
      if (!resp.ok) return []
      const data = (await resp.json()) as { results: Array<{ name: string }> }
      return data.results.map(r => r.name)
    } catch (err) {
      console.error('Docker tags error:', err)
      return []
    }
  })

  ipcMain.handle(IPC.dockerTerminal, async (_e, payload: { containerId: string; cols: number; rows: number }) => {
    const id = randomUUID()
    const { containerId, cols, rows } = payload
    try {
      const term = pty.spawn('docker', ['exec', '-it', containerId, 'sh', '-c', '[ -x /bin/bash ] && exec /bin/bash || exec sh'], {
        name: 'xterm-256color',
        cols: Math.max(2, cols),
        rows: Math.max(2, rows),
        env: process.env as { [key: string]: string },
      })
      terminals.set(id, term)
      term.onData((data) => broadcast(IPC.terminalData, { id, data }))
      term.onExit(() => {
        terminals.delete(id)
        broadcast(IPC.terminalExit, { id })
      })
      return { ok: true, id }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.metrics, async () => await collectMetrics())

  ipcMain.handle(IPC.getHostPorts, async () => {
    const hostPorts = await new Promise<HostPortRow[]>((resolve) => {
      // Use 'ss -tunl' to get listening TCP/UDP ports
      execFile('ss', ['-tunl', '-H'], (err, stdout) => {
        if (err) {
          // Fallback to netstat if ss fails
          execFile('netstat', ['-tunl', '-W'], (err2, stdout2) => {
            if (err2) return resolve([])
            resolve(parseNetstat(stdout2))
          })
          return
        }
        resolve(parseSs(stdout))
      })
    })
    const dockerPorts = await dockerPublishedHostPorts()
    const merged = new Map<string, HostPortRow>()
    for (const row of [...hostPorts, ...dockerPorts]) {
      if (!Number.isFinite(row.port) || row.port <= 0) continue
      const key = `${row.protocol}:${row.port}`
      if (!merged.has(key)) merged.set(key, row)
    }
    return [...merged.values()].sort((a, b) => a.port - b.port)
  })

  ipcMain.handle(IPC.monitorTopProcesses, async () => {
    return await new Promise<TopProcessRow[]>((resolve) => {
      execFile('ps', ['-eo', 'pid,comm,%cpu,%mem', '--sort=-%cpu'], (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        const rows = stdout
          .split('\n')
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 8)
          .map((line) => {
            const parts = line.split(/\s+/)
            const pid = Number(parts[0] ?? 0)
            const cpu = Number(parts[2] ?? 0)
            const mem = Number(parts[3] ?? 0)
            return {
              pid,
              command: parts[1] ?? 'unknown',
              cpuPercent: Number.isFinite(cpu) ? cpu : 0,
              memPercent: Number.isFinite(mem) ? mem : 0,
            }
          })
          .filter((p) => p.pid > 0)
        resolve(rows)
      })
    })
  })

  ipcMain.handle(IPC.monitorSecurity, async () => {
    const execText = async (cmd: string): Promise<string> =>
      await new Promise((resolve) => {
        execFile('bash', ['-lc', cmd], (err, stdout) => {
          if (err) resolve('')
          else resolve((stdout ?? '').trim())
        })
      })

    const firewallRaw = await execText('command -v ufw >/dev/null 2>&1 && ufw status | head -n 1 || echo unknown')
    const firewall: HostSecuritySnapshot['firewall'] =
      /active/i.test(firewallRaw) ? 'active' : /inactive/i.test(firewallRaw) ? 'inactive' : 'unknown'

    const selinux = (await execText('command -v getenforce >/dev/null 2>&1 && getenforce || echo unavailable')) || 'unavailable'
    const sshPermitRootLogin = (await execText("sshd -T 2>/dev/null | awk '/permitrootlogin/{print $2; exit}'")) || 'unknown'
    const sshPasswordAuth = (await execText("sshd -T 2>/dev/null | awk '/passwordauthentication/{print $2; exit}'")) || 'unknown'
    const failedAuthRaw = await execText("journalctl --since '24 hours ago' -u sshd --no-pager 2>/dev/null | rg -i 'failed password|invalid user|authentication failure' | wc -l")
    const failedAuth24h = Number.parseInt(failedAuthRaw || '0', 10) || 0

    const hostPorts = await new Promise<HostPortRow[]>((resolve) => {
      execFile('ss', ['-tunl', '-H'], (err, stdout) => {
        if (err) resolve([])
        else resolve(parseSs(stdout))
      })
    })
    const riskySet = new Set([21, 23, 2375, 3389, 5900])
    const riskyOpenPorts = hostPorts.map((p) => p.port).filter((p) => riskySet.has(p))

    const out: HostSecuritySnapshot = {
      firewall,
      selinux,
      sshPermitRootLogin,
      sshPasswordAuth,
      failedAuth24h,
      riskyOpenPorts: [...new Set(riskyOpenPorts)],
    }
    return out
  })

  ipcMain.handle(IPC.monitorSecurityDrilldown, async () => {
    const failedAuthRaw = await new Promise<string>((resolve) => {
      execFile(
        'bash',
        ['-lc', "journalctl --since '24 hours ago' -u sshd --no-pager 2>/dev/null | rg -i 'failed password|invalid user|authentication failure' | tail -n 8"],
        (err, stdout) => {
          if (err) resolve('')
          else resolve((stdout ?? '').trim())
        }
      )
    })
    const failedAuthSamples = failedAuthRaw ? failedAuthRaw.split('\n').map((l) => l.trim()).filter(Boolean) : []

    const riskySet = new Set([21, 23, 2375, 3389, 5900])
    const riskyPortOwners = await new Promise<Array<{ port: number; process: string; pid?: number }>>((resolve) => {
      execFile('ss', ['-tulpn', '-H'], (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        const out: Array<{ port: number; process: string; pid?: number }> = []
        for (const line of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const parts = line.split(/\s+/)
          const local = parts[4] ?? ''
          const idx = local.lastIndexOf(':')
          const port = Number.parseInt(idx >= 0 ? local.slice(idx + 1) : '', 10)
          if (!Number.isFinite(port) || !riskySet.has(port)) continue
          const m = line.match(/users:\(\("([^"]+)",pid=(\d+)/)
          out.push({
            port,
            process: m?.[1] ?? 'unknown',
            pid: m?.[2] ? Number.parseInt(m[2], 10) : undefined,
          })
        }
        resolve(out)
      })
    })

    const response: HostSecurityDrilldown = {
      failedAuthSamples,
      riskyPortOwners,
    }
    return response
  })

  ipcMain.handle(IPC.getHostSysInfo, async (): Promise<HostSysInfo> => {
    const nets = os.networkInterfaces()
    let ip = ''
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          ip = net.address
          break
        }
      }
      if (ip) break
    }

    // Attempt to gather more detailed info
    let distro = ''
    try {
      const osRel = await readFile('/etc/os-release', 'utf8')
      const match = osRel.match(/^PRETTY_NAME="?([^"\n]+)"?/m)
      if (match) distro = match[1]
    } catch { distro = `${os.type()} ${os.release()}` }

    let gpu = ''
    try {
      const { stdout } = await new Promise<{stdout: string}>(res => execFile('lspci', ['-v'], (err, stdout) => res({stdout})))
      const match = stdout.match(/VGA compatible controller: (.+)/)
      if (match) gpu = match[1].split(' (rev')[0]
    } catch { gpu = 'Unknown' }

    let packages = ''
    try {
      const { stdout: rpmCount } = await new Promise<{stdout: string}>(res => execFile('rpm', ['-qa'], (err, stdout) => res({stdout})))
      const { stdout: flatpakCount } = await new Promise<{stdout: string}>(res => execFile('flatpak', ['list'], (err, stdout) => res({stdout})))
      packages = `${rpmCount.split('\n').filter(Boolean).length} (rpm), ${flatpakCount.split('\n').filter(Boolean).length} (flatpak)`
    } catch { packages = 'Unknown' }

    let resolution = ''
    try {
      const { stdout } = await new Promise<{stdout: string}>(res => execFile('xdpyinfo', [], (err, stdout) => res({stdout})))
      const match = stdout.match(/dimensions:\s+(\d+x\d+)/)
      if (match) resolution = match[1]
    } catch { resolution = 'Unknown' }

    return {
      hostname: os.hostname(),
      os: distro,
      kernel: os.release(),
      arch: os.arch(),
      uptime: Math.round(os.uptime()),
      ip,
      distro,
      shell: process.env.SHELL?.split('/').pop() || 'bash',
      de: process.env.XDG_CURRENT_DESKTOP || 'Unknown',
      wm: process.env.XDG_SESSION_DESKTOP || 'Unknown',
      gpu,
      memoryUsage: `${((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(1)} GiB / ${(os.totalmem() / (1024 ** 3)).toFixed(1)} GiB`,
      packages,
      resolution
    }
  })

  ipcMain.handle(IPC.runtimeStatus, async (): Promise<RuntimeStatusResponse> => {
    const runtimeIds = Object.keys(RUNTIME_DETECT_COMMANDS)
    const results = await Promise.all(
      runtimeIds.map(async (id) => {
        const probe = RUNTIME_DETECT_COMMANDS[id]
        const status = await detectRuntimeInstallation(id, probe.cmd, probe.args)
        return { id, name: probe.name, ...status }
      })
    )

    return {
      runtimes: results
    }
  })

  ipcMain.handle(IPC.runtimeGetVersions, async (_e, payload: { runtimeId?: string }) => {
    const runtimeId = (payload?.runtimeId || 'unknown').toLowerCase()

    try {
      if (runtimeId === 'node') return await fetchNodeVersionsForPicker()
      if (runtimeId === 'go') return await fetchGoVersionsForPicker()
      if (runtimeId === 'python') return await fetchPythonVersionsForPicker()
      if (runtimeId === 'bun') return await fetchBunVersionsForPicker()
      if (runtimeId === 'zig') {
        const res = await fetch('https://ziglang.org/download/index.json').then((r) => r.json()) as Record<string, unknown>
        const keys = Object.keys(res)
          .filter((k) => k !== 'master')
          .sort(compareSemverDesc)
        return keys.slice(0, 60)
      }
      if (runtimeId === 'php') return await fetchEolLatestVersions('php', 55)
      if (runtimeId === 'ruby') return await fetchEolLatestVersions('ruby', 45)
      if (runtimeId === 'lua') return await fetchEolLatestVersions('lua', 35)
      if (runtimeId === 'rust') {
        const patch = await fetchEolLatestVersions('rust', 85)
        return ['stable', 'beta', 'nightly', ...patch]
      }
      if (runtimeId === 'julia') return await fetchJuliaVersionsForPicker()
      if (runtimeId === 'java') return await fetchJavaVersionsForPicker()
      if (runtimeId === 'dotnet') return await fetchDotnetSdkVersionsForPicker()
      if (runtimeId === 'dart') return await fetchDartSdkVersionsForPicker()
      if (runtimeId === 'flutter') return await fetchFlutterLinuxVersionsForPicker()
    } catch (e) {
      console.warn(`Dynamic version list failed for ${runtimeId}, using static fallback.`, e)
    }

    const versions: Record<string, string[]> = {
      node: ['22.12.0', '22.11.0', '20.18.0', '20.17.0', '18.20.4', '18.19.0', '16.20.2', '14.21.3', '12.22.12'],
      python: ['3.14.0', '3.13.2', '3.12.8', '3.11.9', '3.10.14', '3.9.19', '3.8.18'],
      go: ['1.24.0', '1.23.4', '1.22.6', '1.21.8', '1.20.14', '1.19.13', '1.18.10', '1.17.13'],
      rust: [
        'stable', 'beta', 'nightly',
        '1.85.0', '1.84.0', '1.83.0', '1.82.0', '1.80.0', '1.75.0', '1.70.0', '1.65.0',
      ],
      bun: ['canary', '1.2.2', '1.1.42', '1.0.36', '1.0.30', '1.0.0'],
      java: [
        '25.0.1+8-LTS (LTS)', '24.0.2+12', '23.0.2+7', '22.0.2+9',
        '21.0.11+10-LTS (LTS)', '17.0.13+11-LTS (LTS)', '11.0.25+9-LTS (LTS)', '8.0.432+6-LTS (LTS)',
      ],
      php: ['8.5.0', '8.4.5', '8.3.15', '8.2.27', '8.1.31', '8.0.30', '7.4.33'],
      ruby: ['4.0.0', '3.4.2', '3.3.7', '3.2.6', '3.1.6', '3.0.7', '2.7.8'],
      zig: ['0.14.0', '0.13.0', '0.12.1', '0.11.0', '0.10.1', '0.9.1'],
      dotnet: [
        '11.0 · SDK 11.0.100-preview · STS',
        '10.0 · SDK 10.0.203 · LTS',
        '9.0 · SDK 9.0.313 · STS',
        '8.0 · SDK 8.0.420 · LTS',
        '7.0 · SDK 7.0.410 · STS',
        '6.0 · SDK 6.0.428 · LTS',
        '3.1 · SDK 3.1.426 · LTS',
      ],
      c_cpp: [
        '15.1', '15.0', '14.2', '14.1', '13.3', '13.2', '12.4', '12.3', '11.4', '10.5',
      ],
      matlab: ['9.4.0', '9.3.0', '9.2.0', '9.1.0', '8.4.0', '8.3.0', '8.2.0', '8.1.0', '7.4.0'],
      dart: [
        '3.8.1', '3.8.0', '3.7.2', '3.7.1', '3.7.0', '3.6.2', '3.6.1', '3.6.0', '3.5.4', '3.5.3', '3.5.2', '3.5.1', '3.5.0',
        '3.4.4', '3.4.3', '3.4.2', '3.4.1', '3.4.0', '3.3.4', '3.3.3', '3.3.2', '3.3.1', '3.3.0', '3.2.6', '3.2.5', '3.2.4',
        '3.1.5', '3.1.4', '3.1.3', '3.0.7', '3.0.6', '3.0.5',
      ],
      flutter: ['3.29.0', '3.27.0', '3.24.0', '3.22.0', '3.19.0', '3.16.0', '3.13.0', '3.10.0'],
      julia: [
        '1.12.0', '1.11.4', '1.11.3', '1.11.2', '1.11.1', '1.11.0', '1.10.5', '1.10.4', '1.10.3', '1.10.2', '1.10.1', '1.10.0',
        '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9.0', '1.8.5', '1.8.4', '1.8.3', '1.8.2', '1.8.1', '1.8.0', '1.7.3', '1.7.2', '1.7.1',
        '1.6.7', '1.6.6', '1.6.5', '1.6.4', '1.6.3',
      ],
      lua: ['5.5.0', '5.4.8', '5.4.7', '5.3.6', '5.2.4', '5.1.5', '5.0.3'],
      lisp: [
        '2.5.5', '2.5.4', '2.5.3', '2.5.2', '2.5.1', '2.5.0',
        '2.4.10', '2.4.9', '2.4.8', '2.4.7', '2.4.6', '2.4.5', '2.4.4', '2.4.3', '2.4.2', '2.4.1', '2.4.0',
        '2.3.11', '2.3.10', '2.3.9', '2.3.8',
      ],
    }
    return versions[runtimeId] || ['latest']
  })

  ipcMain.handle('dh:runtime:check-deps', async (_e, raw: unknown) => {
    const { execSync } = await import('node:child_process')
    const payload = z.object({ runtimeId: z.string().optional() }).optional().parse(raw)
    const runtimeId = payload?.runtimeId ?? 'node'
    const distro = detectHostDistroSync()

    const check = (cmd: string) => {
      try {
        const out = execSync(`which ${cmd} 2>/dev/null`).toString().trim()
        return !!out
      } catch { return false }
    }
    const isPkgInstalled = (name: string) => {
      try {
        if (distro === 'fedora') execSync(`rpm -q ${name}`, { stdio: 'ignore' })
        else if (distro === 'arch') execSync(`pacman -Q ${name}`, { stdio: 'ignore' })
        else execSync(`dpkg -s ${name}`, { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    }
    const packages = (RUNTIME_DEP_PACKAGES[runtimeId] ?? RUNTIME_DEP_PACKAGES.node)[distro] ?? []
    const installHint = distro === 'fedora'
      ? `dnf install ${packages.join(' ')}`
      : distro === 'arch'
        ? `pacman -S --needed ${packages.join(' ')}`
        : `apt-get install ${packages.join(' ')}`
    const commandCheck = RUNTIME_DETECT_COMMANDS[runtimeId]?.cmd
    const rows = packages.map((p) => ({
      name: p,
      ok: isPkgInstalled(p),
      status: isPkgInstalled(p) ? 'Detected' : `Missing (${installHint})`,
    }))
    if (commandCheck) {
      rows.push({
        name: `${commandCheck} command`,
        ok: check(commandCheck),
        status: check(commandCheck) ? 'Detected' : 'Missing',
      })
    }
    return rows
  })

  ipcMain.handle('dh:runtime:uninstall:preview', async (_e, raw: unknown) => {
    const payload = z.object({
      runtimeId: z.string().min(1),
      removeMode: z.enum(['runtime_only', 'runtime_and_deps']).default('runtime_only'),
    }).parse(raw)
    const distro = detectHostDistroSync()
    const runtimePackages = (RUNTIME_INSTALL_PACKAGES[payload.runtimeId]?.[distro] ?? []).filter(Boolean)
    const plan = dependencyRemovalPlan(payload.runtimeId, distro)
    const removableDeps = plan.removable
    const finalPackages = payload.removeMode === 'runtime_and_deps'
      ? [...new Set([...runtimePackages, ...removableDeps])]
      : [...new Set(runtimePackages)]
    let note: string | undefined
    if (payload.runtimeId === 'bun' || payload.runtimeId === 'rust') {
      note = 'This runtime may be installed via local script, so package list can be empty and local files are removed instead.'
    }
    return { distro, runtimePackages, removableDeps, blockedSharedDeps: plan.blockedShared, finalPackages, note }
  })

  ipcMain.handle(IPC.hostExec, async (_e, raw: unknown) => {
    const req = HostExecRequestSchema.parse(raw)
    if (req.command === 'nvidia_smi_short') {
      return await new Promise<string>((res) => {
        execFile(
          'nvidia-smi',
          ['--query-gpu=name', '--format=csv,noheader'],
          { timeout: 5000 },
          (err, stdout) => {
            if (err) res('GPU: unavailable')
            else res(stdout.trim() || 'GPU')
          }
        )
      })
    }
    if (req.command === 'flatpak_spawn_echo') {
      return 'flatpak-spawn: configure host helper for sandboxed metrics'
    }
    if (req.command === 'systemctl_is_active' && req.unit) {
      const row = await systemdRow(req.unit.replace(/\.service$/, ''))
      return row.state
    }
    if (req.command === 'docker_install_step') {
      if (!req.distro && req.stepIndex !== undefined) throw new Error('Missing install distro')
      if (req.distro === undefined || req.stepIndex === undefined) throw new Error('Missing install step payload')
      const steps = DOCKER_INSTALL_STEPS[req.distro]
      const command = steps[req.stepIndex]
      if (!command) throw new Error('Invalid install step')
      return await new Promise<{ ok: boolean; code: number | null; output: string }>((resolveExec) => {
        execFile(
          'pkexec',
          ['bash', '-lc', command],
          { maxBuffer: 1024 * 1024 * 8, timeout: 1000 * 60 * 20 },
          (err, stdout, stderr) => {
            const output = `${stdout ?? ''}${stderr ?? ''}`.trim()
            if (err) {
              const code = typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : null
              resolveExec({
                ok: false,
                code,
                output: output || (err instanceof Error ? err.message : String(err)),
              })
              return
            }
            resolveExec({ ok: true, code: 0, output: output || 'Step completed successfully.' })
          }
        )
      })
    }
    throw new Error('Unsupported host command')
  })

  ipcMain.handle(IPC.composeUp, async (_e, raw: unknown) => {
    const { profile } = ComposeUpRequestSchema.parse(raw)
    const dir = profileComposeDir(profile)
    return await new Promise<{ ok: boolean; log: string }>((resolveCompose) => {
      const child = spawn('docker', ['compose', 'up', '-d'], {
        cwd: dir,
        env: { ...process.env },
      })
      let log = ''
      child.stdout?.on('data', (d) => {
        log += d.toString()
      })
      child.stderr?.on('data', (d) => {
        log += d.toString()
      })
      child.on('error', (err) => {
        resolveCompose({ ok: false, log: String(err) })
      })
      child.on('close', (code) => {
        resolveCompose({ ok: code === 0, log: log || `exit ${code}` })
      })
    })
  })

  ipcMain.handle(IPC.composeLogs, async (_e, raw: unknown) => {
    const { profile } = ComposeUpRequestSchema.parse(raw)
    const dir = profileComposeDir(profile)
    return await new Promise<string>((res) => {
      execFile(
        'docker',
        ['compose', 'logs', '--no-color', '--tail', '80'],
        { cwd: dir, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) res(String(err))
          else res(stdout ?? '')
        }
      )
    })
  })

  ipcMain.handle(IPC.terminalCreate, (_e, payload: { cols: number; rows: number; cmd?: string; args?: string[] }) => {
    const { cols, rows, cmd, args } = payload
    const shellBin = cmd ?? (process.env.SHELL || '/bin/bash')
    const shellArgs = args ?? []
    const id = randomUUID()
    try {
      const term = pty.spawn(shellBin, shellArgs, {
        name: 'xterm-color',
        cols: Math.max(2, cols),
        rows: Math.max(2, rows),
        cwd: homedir(),
        env: process.env as { [key: string]: string },
      })
      terminals.set(id, term)
      term.onData((data) => {
        broadcast(IPC.terminalData, { id, data })
      })
      term.onExit(() => {
        terminals.delete(id)
        broadcast(IPC.terminalExit, { id })
      })
      return { ok: true as const, id }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.on(IPC.terminalWrite, (_e, payload: { id: string; data: string }) => {
    terminals.get(payload.id)?.write(payload.data)
  })

  ipcMain.on(IPC.terminalResize, (_e, payload: { id: string; cols: number; rows: number }) => {
    terminals.get(payload.id)?.resize(payload.cols, payload.rows)
  })

  ipcMain.handle(IPC.openExternalTerminal, async () => {
    const trySpawn = (cmd: string, args: string[] = []) =>
      new Promise<boolean>((res) => {
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
        child.on('error', () => res(false))
        child.unref()
        res(true)
      })
    const order: [string, ...string[]][] = [
      ['xdg-terminal-emulator'],
      ['kitty'],
      ['alacritty'],
      ['gnome-terminal'],
      ['konsole'],
    ]
    for (const [cmd, ...rest] of order) {
      if (await trySpawn(cmd, [...rest])) return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle(IPC.gitClone, async (_e, raw: unknown) => {
    const req = GitCloneRequestSchema.parse(raw)
    const dir = assertAllowedWritePath(req.targetDir)
    await simpleGit().clone(req.url, dir)
    const recent = await loadRecentRepos()
    const next: GitRepoEntry[] = [
      { path: dir, lastOpened: Date.now() },
      ...recent.filter((r) => r.path !== dir),
    ]
    await saveRecentRepos(next)
    return { ok: true }
  })

  ipcMain.handle(IPC.gitStatus, async (_e, raw: unknown) => {
    const req = GitStatusRequestSchema.parse(raw)
    const repoPath = assertAllowedWritePath(req.repoPath)
    const st = await simpleGit(repoPath).status()
    return {
      branch: st.current ?? 'unknown',
      tracking: st.tracking,
      ahead: st.ahead,
      behind: st.behind,
      modified: st.modified.length,
      created: st.created.length,
      deleted: st.deleted.length,
    }
  })

  ipcMain.handle(IPC.gitRecentList, async () => await loadRecentRepos())

  ipcMain.handle(IPC.gitRecentAdd, async (_e, raw: unknown) => {
    const req = GitRecentAddSchema.parse(raw)
    const repoPath = assertAllowedWritePath(req.path)
    const recent = await loadRecentRepos()
    const next = [{ path: repoPath, lastOpened: Date.now() }, ...recent.filter((r) => r.path !== repoPath)]
    await saveRecentRepos(next)
    return { ok: true }
  })

  ipcMain.handle(IPC.gitConfigSet, async (_e, raw: unknown) => {
    const { name, email, defaultBranch, defaultEditor, target } = GitConfigSetSchema.parse(raw)
    await execTarget(target, 'git', ['config', '--global', 'user.name', name])
    await execTarget(target, 'git', ['config', '--global', 'user.email', email])
    if (defaultBranch?.trim()) {
      await execTarget(target, 'git', ['config', '--global', 'init.defaultBranch', defaultBranch.trim()])
    }
    if (defaultEditor?.trim()) {
      await execTarget(target, 'git', ['config', '--global', 'core.editor', defaultEditor.trim()])
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.gitConfigList, async (_e, raw: unknown) => {
    const { target } = GitConfigListSchema.parse(raw)
    const out = await execTarget(target, 'git', ['config', '--global', '--list'])
    const rows = out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf('=')
        if (i < 0) return { key: line, value: '' }
        return { key: line.slice(0, i), value: line.slice(i + 1) }
      })
      .sort((a, b) => a.key.localeCompare(b.key))
    return { ok: true, rows }
  })

  ipcMain.handle(IPC.sshGenerate, async (_e, raw: unknown) => {
    const { target, email } = SshGenerateSchema.parse(raw)
    const sshDir = path.join(homedir(), '.ssh')
    const keyPath = path.join(sshDir, 'id_ed25519')
    const comment = email && email.trim() !== '' ? email.trim() : 'linux-dev-home'
    
    if (target === 'host') {
      await execTarget('host', 'mkdir', ['-p', sshDir])
      await execTarget('host', 'ssh-keygen', ['-t', 'ed25519', '-C', comment, '-N', '', '-f', keyPath])
    } else {
      await mkdir(sshDir, { recursive: true })
      await execTarget('sandbox', 'ssh-keygen', ['-t', 'ed25519', '-C', comment, '-N', '', '-f', keyPath])
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.sshGetPub, async (_e, raw: unknown) => {
    const { target } = SshGetPubSchema.parse(raw)
    const pubPath = path.join(homedir(), '.ssh', 'id_ed25519.pub')
    try {
      let pub = ''
      if (target === 'host') {
        pub = (await execTarget('host', 'cat', [pubPath])).trim()
      } else {
        pub = (await readFile(pubPath, 'utf8')).trim()
      }

      if (!pub) return null

      // Get fingerprint: ssh-keygen -lf /path/to/key.pub
      let fingerprint = ''
      try {
        if (target === 'host') {
          fingerprint = (await execTarget('host', 'ssh-keygen', ['-lf', pubPath])).trim()
        } else {
          fingerprint = await new Promise<string>((resolve) => {
            execFile('ssh-keygen', ['-lf', pubPath], (err, stdout) => {
              resolve(err ? '' : stdout.trim())
            })
          })
        }
      } catch {
        fingerprint = 'Unknown fingerprint'
      }

      return { pub, fingerprint }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.sshTestGithub, async (_e, raw: unknown) => {
    const { target } = SshTestGithubSchema.parse(raw)
    const isFlatpak = !!process.env.FLATPAK_ID
    let cmd = 'ssh'
    let args = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'git@github.com']
    if (target === 'host' && isFlatpak) {
      cmd = 'flatpak-spawn'
      args = ['--host', 'ssh', ...args]
    }
    return await new Promise<{ ok: boolean; output: string; code: number | null }>((resolveTest) => {
      const child = spawn(cmd, args)
      let out = ''
      child.stdout.on('data', (d) => {
        out += d.toString()
      })
      child.stderr.on('data', (d) => {
        out += d.toString()
      })
      child.on('error', (err) => {
        resolveTest({ ok: false, output: String(err), code: null })
      })
      child.on('close', (code) => {
        const text = out.trim() || `exit ${code ?? 'unknown'}`
        const ok = /successfully authenticated/i.test(text) || /hi .*github/i.test(text)
        resolveTest({ ok, output: text, code: code ?? null })
      })
    })
  })

  ipcMain.handle(IPC.selectFolder, async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  // Open a native file picker dialog (multiple files or folders allowed)
  ipcMain.handle(IPC.filePickOpen, async (_e, raw: unknown) => {
    const opts = (raw as { folders?: boolean; multiple?: boolean }) ?? {}
    const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] = opts.folders
      ? ['openDirectory']
      : ['openFile']
    if (opts.multiple) properties.push('multiSelections')
    const r = await dialog.showOpenDialog(mainWindow!, { properties })
    if (r.canceled) return []
    return r.filePaths
  })

  // Open a native save/destination folder picker
  ipcMain.handle(IPC.filePickSave, async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  // List files in a remote directory via SSH
  ipcMain.handle(IPC.sshListDir, async (_e, raw: unknown) => {
    const { user, host, port, remotePath } = raw as { user: string; host: string; port: number; remotePath: string }
    
    // Expand ~/ to $HOME or relative . to avoid issues with quoted ~ in ls
    let finalPath = remotePath
    if (finalPath === '~' || finalPath === '~/') {
      finalPath = '.'
    } else if (finalPath.startsWith('~/')) {
      finalPath = finalPath.replace(/^~\//, '')
    }

    return new Promise<{ ok: boolean; entries: string[]; error?: string }>((resolve) => {
      execFile('ssh', [
        '-p', String(port),
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=5',
        `${user}@${host}`,
        `ls -1a "${finalPath}"`,
      ], { timeout: 8000 }, (err, stdout) => {
        if (err) {
          let msg = err.message
          if (msg.includes('Permission denied')) {
            msg += '\n\n💡 Tip: To use the File Browser, your SSH public key must be added to the server (authorized_keys). The browser does not support password auth yet.'
          } else if (msg.includes('Connection timed out') || msg.includes('Connection refused')) {
             msg += '\n\n💡 Tip: Make sure the server is running and the Port is correct.'
          }
          resolve({ ok: false, entries: [], error: msg })
        } else {
          const entries = stdout.split('\n').map(l => l.trim()).filter(Boolean)
          resolve({ ok: true, entries })
        }
      })
    })
  })

  // Setup SSH key on a remote server with a password (GUI flow)
  ipcMain.handle(IPC.sshSetupRemoteKey, async (_e, raw: unknown) => {
    const { user, host, port, password, publicKey } = z
      .object({
        user: z.string().min(1),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        password: z.string(),
        publicKey: z.string().min(1),
      })
      .parse(raw)
    const envVars: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
    return new Promise((resolve) => {
      const ptyProcess = pty.spawn('ssh', [
        '-p', String(port),
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'PreferredAuthentications=password',
        `${user}@${host}`,
        `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
      ], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: homedir(),
        env: envVars,
      })

      let output = ''
      let resolved = false

      ptyProcess.onData((data) => {
        output += data
        // Watch for password prompt
        if (data.toLowerCase().includes('password:')) {
          ptyProcess.write(password + '\n')
        }
      })

      ptyProcess.onExit(({ exitCode }) => {
        if (resolved) return
        resolved = true
        if (exitCode === 0) {
          resolve({ ok: true })
        } else {
          resolve({ ok: false, error: output || 'SSH command failed' })
        }
      })

      // Safety timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          ptyProcess.kill()
          resolve({ ok: false, error: 'Connection timed out. Please check your host and password.' })
        }
      }, 20000)
    })
  })

  ipcMain.handle(IPC.sessionInfo, async () => getSessionInfo())

  ipcMain.handle(IPC.layoutGet, async () => await readDashboardLayout())

  ipcMain.handle(IPC.layoutSet, async (_e, raw: unknown) => {
    const layout = DashboardLayoutFileSchema.parse(raw)
    await writeDashboardLayout(layout)
    return { ok: true as const }
  })

  ipcMain.handle(IPC.storeGet, async (_e, raw: unknown) => {
    const { key } = StoreGetRequestSchema.parse(raw)
    const storePath = path.join(app.getPath('userData'), `store_${key}.json`)
    try {
      const content = await readFile(storePath, 'utf8')
      const parsed = JSON.parse(content) as unknown
      if (key === 'custom_profiles') {
        return CustomProfilesStoreSchema.parse(parsed)
      }
      if (key === 'wizard_state') {
        return WizardStateStoreSchema.parse(parsed)
      }
      if (key === 'ssh_bookmarks') {
        return z.array(z.object({
          id: z.string(),
          name: z.string(),
          user: z.string(),
          host: z.string(),
          port: z.number().default(22),
        })).parse(parsed)
      }
      return null
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.storeSet, async (_e, raw: unknown) => {
    const body = StoreSetRequestSchema.parse(raw)
    const storePath = path.join(app.getPath('userData'), `store_${body.key}.json`)
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(storePath, JSON.stringify(body.data, null, 2))
    return { ok: true }
  })

  ipcMain.handle(IPC.jobStart, async (_e, raw: unknown) => {
    const req = JobStartRequestSchema.parse(raw)
    pruneFinishedJobs()
    const id = randomUUID()

    if (req.kind === 'demo_countdown') {
      const durationMs = req.durationMs ?? 4000
      const steps = 8
      const tick = Math.max(120, Math.floor(durationMs / steps))
      const job: JobRecord = {
        id,
        kind: req.kind,
        state: 'running',
        progress: 0,
        log: ['Demo job started (Phase 0 task runner smoke test).'],
        cancelRequested: false,
      }
      jobs.set(id, job)
      let step = 0
      job.timer = setInterval(() => {
        const j = jobs.get(id)
        if (!j) return
        if (j.cancelRequested) {
          j.state = 'cancelled'
          j.log.push('Cancelled by user.')
          if (j.timer) clearInterval(j.timer)
          delete j.timer
          return
        }
        step += 1
        j.progress = Math.min(100, Math.round((step / steps) * 100))
        j.log.push(`Step ${step}/${steps} — ${j.progress}%`)
        if (step >= steps) {
          j.state = 'completed'
          j.progress = 100
          j.log.push('Done.')
          if (j.timer) clearInterval(j.timer)
          delete j.timer
        }
      }, tick)
      return { id }
    }

    if (req.kind === 'install_deps') {
      const distro = detectHostDistroSync()
      const runtimeId = req.runtimeId ?? 'node'
      const selected = RUNTIME_DEP_PACKAGES[runtimeId] ?? RUNTIME_DEP_PACKAGES.node
      const packages = selected[distro]
      const installCommands: Record<'fedora' | 'ubuntu' | 'arch', string> = {
        fedora: 'dnf install -y',
        ubuntu: 'apt-get install -y',
        arch: 'pacman -S --needed --noconfirm',
      }
      const job: JobRecord = {
        id, kind: 'install_deps', state: 'running', progress: 0,
        log: [`Starting dependency installation for ${runtimeId} (${distro.toUpperCase()})...`],
        cancelRequested: false,
      }
      jobs.set(id, job)
      const proc = spawn('pkexec', ['bash', '-lc', `${installCommands[distro]} ${packages.join(' ')}`], { shell: false })
      job.proc = proc
      const pt = createJobStreamProgress(job)
      proc.stdout.on('data', (d) => {
        job.log.push(d.toString().trim())
        pt.bump(1)
      })
      proc.stderr.on('data', (d) => {
        job.log.push(d.toString().trim())
        pt.bump(1)
      })
      proc.on('close', (c) => {
        delete job.proc
        if (job.cancelRequested) {
          job.state = 'cancelled'
          job.log.push('Dependency installation cancelled by user.')
        } else {
          job.state = c === 0 ? 'completed' : 'failed'
          if (c !== 0) job.log.push(`Dependency installation failed with exit code ${c}`)
        }
        job.progress = 100
      })
      return { id }
    }

    if (req.kind === 'runtime_install') {
      const runtimeId = req.runtimeId ?? 'unknown'
      const method = req.method ?? 'system'
      const distro = detectHostDistroSync()
      const job: JobRecord = {
        id,
        kind: `install_${runtimeId}`,
        state: 'running',
        progress: 0,
        log: [`Starting installation of ${runtimeId}...`],
        cancelRequested: false,
      }
      jobs.set(id, job)

      let command = ''
      let args: string[] = []

      if (method === 'system' && runtimeId !== 'bun') {
        const installPackages = (RUNTIME_INSTALL_PACKAGES[runtimeId] ?? RUNTIME_INSTALL_PACKAGES.node)[distro]
        const cmdByDistro: Record<Distro, string> = {
          fedora: `dnf install -y ${installPackages.join(' ')}`,
          ubuntu: `apt-get install -y ${installPackages.join(' ')}`,
          arch: `pacman -S --needed --noconfirm ${installPackages.join(' ')}`,
        }
        command = 'pkexec'
        args = ['bash', '-lc', cmdByDistro[distro]]
      } else {
        // Local/Script Method
        const luminaRuntimes = path.join(homedir(), '.lumina', 'runtimes')
        const _version = normalizeRequestedVersion(runtimeId, req.version)
        job.log.push(`Local install method: aiming for ${_version}`)
        
        if (runtimeId === 'rust') {
          command = 'bash'
          args = ['-c', "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"]
        } else if (runtimeId === 'bun') {
          command = 'bash'
          args = ['-c', "curl -fsSL https://bun.sh/install | bash"]
        } else if (runtimeId === 'node') {
          command = 'bash'
          const nodeTarget =
            _version === 'latest' ? 'node' : _version === 'lts' ? '--lts' : _version
          args = ['-lc', `mkdir -p "${luminaRuntimes}" && export NVM_DIR="$HOME/.nvm" && ([ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash) && . "$NVM_DIR/nvm.sh" && nvm install ${nodeTarget} && nvm alias default ${nodeTarget}`]
        } else if (runtimeId === 'go') {
          command = 'bash'
          const goVer = await resolveGoTarballVersion(_version)
          job.log.push(`Resolved Go install tarball: ${goVer}`)
          args = ['-lc', `set -e; mkdir -p "${luminaRuntimes}"; VER="${goVer}"; TAR="go$VER.linux-amd64.tar.gz"; rm -rf "${luminaRuntimes}/go" "$HOME/.go-tmp"; mkdir -p "$HOME/.go-tmp"; curl -fsSL "https://go.dev/dl/$TAR" -o "$HOME/.go-tmp/$TAR" && tar -C "${luminaRuntimes}" -xzf "$HOME/.go-tmp/$TAR"`]
        } else if (runtimeId === 'python') {
          command = 'bash'
          const pyTarget = await resolvePythonInstallVersion(_version)
          job.log.push(`Resolved Python install version: ${pyTarget}`)
          args = ['-lc', `set -e; export PYENV_ROOT="$HOME/.pyenv"; export PATH="$PYENV_ROOT/bin:$PATH"; if [ ! -d "$PYENV_ROOT" ]; then curl -fsSL https://pyenv.run | bash; fi; eval "$(pyenv init -)"; pyenv install -s ${pyTarget}; pyenv global ${pyTarget}`]
        } else {
          job.state = 'failed'
          job.progress = 100
          job.log.push(`Local installer is not implemented for "${runtimeId}".`)
          job.log.push('Try "System Package Manager" method for this runtime.')
          return { id }
        }
      }

      if (command) {
        const proc = spawn(command, args, { shell: false })
        job.proc = proc
        const pt = createJobStreamProgress(job)
        proc.stdout.on('data', (data) => {
          const s = data.toString().trim()
          if (s) {
            job.log.push(s)
            pt.bump(1)
          }
        })
        proc.stderr.on('data', (data) => {
          const s = data.toString().trim()
          if (s) {
            const isError = /error|failed|denied|not found/i.test(s)
            job.log.push(isError ? `[ERR] ${s}` : s)
            pt.bump(1)
          }
        })
        proc.on('close', async (code) => {
          delete job.proc
          if (job.cancelRequested) {
            job.state = 'cancelled'
            job.progress = 100
            job.log.push('Installation cancelled by user.')
            return
          }
          if (code === 0) {
            const probe = RUNTIME_DETECT_COMMANDS[runtimeId]
            if (probe) {
              // Wait a bit for filesystem sync if local
              if (method === 'local') await new Promise(r => setTimeout(r, 1000))
              
              const verified = await detectRuntimeInstallation(runtimeId, probe.cmd, probe.args)
              if (!verified.installed && method === 'system') {
                job.state = 'failed'
                job.progress = 100
                job.log.push('Install command ended successfully, but runtime is not detected on this system.')
                return
              }
              
              // Handle PATH update if requested
              if (req.addToPath && verified.path) {
                job.log.push(`Updating shell PATH for ${verified.path}...`)
                const binDir = path.dirname(verified.path)
                const pathLogs = await appendToShellProfile(binDir)
                pathLogs.forEach(l => job.log.push(l))
              }

              // Run Smoke Test
              job.log.push('Running post-installation smoke test...')
              const testRes = await runSmokeTest(runtimeId, verified.path || probe.cmd)
              if (testRes.ok) {
                job.log.push(`Smoke test passed: ${testRes.output}`)
              } else {
                job.log.push(`[WARN] Smoke test failed or skipped: ${testRes.output}`)
              }
            }

            job.state = 'completed'
            job.progress = 100
            job.log.push('Installation finished successfully.')
          } else {
            job.state = 'failed'
            job.log.push(`Installation failed with exit code ${code}`)
          }
        })
      } else {
        job.state = 'failed'
        job.log.push(`Unsupported runtime: ${runtimeId}`)
      }

      return { id }
    }

    if (req.kind === 'runtime_update') {
      const runtimeId = req.runtimeId ?? 'unknown'
      const distro = detectHostDistroSync()
      const updateProbe = RUNTIME_DETECT_COMMANDS[runtimeId]
      let previousVersion: string | undefined
      if (updateProbe) {
        const before = await detectRuntimeInstallation(runtimeId, updateProbe.cmd, updateProbe.args)
        previousVersion = before.version
      }
      const job: JobRecord = {
        id,
        kind: `update_${runtimeId}`,
        state: 'running',
        progress: 0,
        log: [`Starting update of ${runtimeId}...`],
        cancelRequested: false,
      }
      jobs.set(id, job)

      let command = 'pkexec'
      let args: string[] = []
      if (runtimeId === 'bun') {
        command = 'bash'
        args = ['-lc', 'command -v bun >/dev/null 2>&1 && bun upgrade || (curl -fsSL https://bun.sh/install | bash)']
      } else if (runtimeId === 'rust') {
        command = 'bash'
        args = ['-lc', 'command -v rustup >/dev/null 2>&1 && rustup update || true']
      } else {
        const runtimePackages = (RUNTIME_INSTALL_PACKAGES[runtimeId] ?? RUNTIME_INSTALL_PACKAGES.node)[distro]
        const updateCmdByDistro: Record<Distro, string> = {
          // Use install-style update so it works even when package alias differs
          // or when runtime exists but package name is not currently installed.
          fedora: `dnf install -y ${runtimePackages.join(' ')}`,
          ubuntu: `apt-get update && apt-get install -y ${runtimePackages.join(' ')}`,
          arch: `pacman -S --needed --noconfirm ${runtimePackages.join(' ')}`,
        }
        args = ['bash', '-lc', updateCmdByDistro[distro]]
      }

      const proc = spawn(command, args, { shell: false })
      job.proc = proc
      const ptUpdate = createJobStreamProgress(job)
      proc.stdout.on('data', (d) => {
        const s = d.toString().trim()
        if (s) {
          job.log.push(s)
          ptUpdate.bump(1)
        }
      })
      proc.stderr.on('data', (d) => {
        const s = d.toString().trim()
        if (s) {
          job.log.push(s)
          ptUpdate.bump(1)
        }
      })
      proc.on('close', async (code) => {
        delete job.proc
        if (job.cancelRequested) {
          job.state = 'cancelled'
          job.progress = 100
          job.log.push('Update cancelled by user.')
          return
        }
        if (code === 0) {
          const probe = updateProbe
          if (probe) {
            const verified = await detectRuntimeInstallation(runtimeId, probe.cmd, probe.args)
            if (!verified.installed) {
              job.state = 'failed'
              job.progress = 100
              job.log.push('Update finished, but runtime is no longer detected.')
              return
            }
            if (verified.version) {
              job.log.push(`Detected version after update: ${verified.version}`)
              if (previousVersion && verified.version === previousVersion) {
                job.state = 'completed'
                job.progress = 100
                job.log.push('Already latest: runtime version did not change.')
                return
              }
            }
          }
          job.state = 'completed'
          job.progress = 100
          job.log.push('Update finished successfully.')
        } else {
          job.state = 'failed'
          job.progress = 100
          job.log.push(`Update failed with exit code ${code}`)
        }
      })
      return { id }
    }

    if (req.kind === 'runtime_uninstall') {
      const runtimeId = req.runtimeId ?? 'unknown'
      const distro = detectHostDistroSync()
      const removeMode = req.removeMode ?? 'runtime_only'
      const job: JobRecord = {
        id,
        kind: `uninstall_${runtimeId}`,
        state: 'running',
        progress: 0,
        log: [`Starting uninstall of ${runtimeId}...`],
        cancelRequested: false,
      }
      jobs.set(id, job)

      let command = 'pkexec'
      let args: string[] = []
      if (runtimeId === 'bun') {
        command = 'bash'
        args = ['-lc', 'rm -rf "$HOME/.bun" "$HOME/.local/bin/bun"']
      } else if (runtimeId === 'rust') {
        command = 'bash'
        args = ['-lc', 'command -v rustup >/dev/null 2>&1 && rustup self uninstall -y || true']
      } else {
        const installPackages = (RUNTIME_INSTALL_PACKAGES[runtimeId] ?? RUNTIME_INSTALL_PACKAGES.node)[distro]
        const depPlan = dependencyRemovalPlan(runtimeId, distro)
        const depsToRemove = removeMode === 'runtime_and_deps' ? depPlan.removable : []
        const packagesToRemove = [...new Set([...installPackages, ...depsToRemove])]
        const removeCmdByDistro: Record<Distro, string> = {
          fedora: packagesToRemove.length ? `dnf remove -y ${packagesToRemove.join(' ')}${removeMode === 'runtime_and_deps' ? ' && dnf autoremove -y' : ''}` : 'true',
          ubuntu: packagesToRemove.length ? `apt-get remove -y ${packagesToRemove.join(' ')}${removeMode === 'runtime_and_deps' ? ' && apt-get autoremove -y' : ''}` : 'true',
          arch: packagesToRemove.length ? `pacman -Rns --noconfirm ${packagesToRemove.join(' ')}` : 'true',
        }
        if (!packagesToRemove.length) {
          job.log.push('No package-managed runtime artifacts detected. Nothing to remove from system packages.')
        }
        if (removeMode === 'runtime_and_deps' && depPlan.blockedShared.length) {
          job.log.push(`Skipped shared dependencies (still used by other runtimes): ${depPlan.blockedShared.join(', ')}`)
        }
        args = ['bash', '-lc', removeCmdByDistro[distro]]
      }

      const proc = spawn(command, args, { shell: false })
      job.proc = proc
      const ptUn = createJobStreamProgress(job)
      proc.stdout.on('data', (d) => {
        const s = d.toString().trim()
        if (s) {
          job.log.push(s)
          ptUn.bump(1)
        }
      })
      proc.stderr.on('data', (d) => {
        const s = d.toString().trim()
        if (s) {
          job.log.push(s)
          ptUn.bump(1)
        }
      })
      proc.on('close', async (code) => {
        delete job.proc
        if (job.cancelRequested) {
          job.state = 'cancelled'
          job.progress = 100
          job.log.push('Uninstall cancelled by user.')
          return
        }
        if (code === 0) {
          const probe = RUNTIME_DETECT_COMMANDS[runtimeId]
          if (probe) {
            const stillInstalled = await detectRuntimeInstallation(runtimeId, probe.cmd, probe.args)
            if (stillInstalled.installed) {
              job.state = 'failed'
              job.progress = 100
              job.log.push('Uninstall command finished, but runtime is still detected.')
              return
            }
          }
          job.state = 'completed'
          job.progress = 100
          job.log.push('Uninstall finished successfully.')
        } else {
          job.state = 'failed'
          job.progress = 100
          job.log.push(`Uninstall failed with exit code ${code}`)
        }
      })
      return { id }
    }

    throw new Error('Unsupported job kind')
  })

  ipcMain.handle(IPC.jobsList, async () => {
    return [...jobs.values()].map((j) => jobToSummary(j))
  })

  ipcMain.handle(IPC.jobCancel, async (_e, raw: unknown) => {
    const { id } = JobCancelRequestSchema.parse(raw)
    const j = jobs.get(id)
    if (!j) return { ok: false as const, reason: 'not_found' as const }
    if (j.state !== 'running') return { ok: false as const, reason: 'not_running' as const }
    j.cancelRequested = true
    if (j.proc && !j.proc.killed) {
      j.log.push('Cancellation requested. Stopping active process...')
      try {
        j.proc.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (j.proc && !j.proc.killed) {
          try {
            j.proc.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }
      }, 1500)
    }
    return { ok: true as const }
  })

  ipcMain.handle('dh:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Linux Dev Home',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

function parseSs(stdout: string): HostPortRow[] {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.map((line) => {
    const parts = line.split(/\s+/).filter(Boolean)
    // Typical ss -tunl -H line:
    // tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*
    // udp UNCONN 0 0 0.0.0.0:68 0.0.0.0:*
    const netid = (parts[0] ?? '').toLowerCase()
    const protocol: 'tcp' | 'udp' = netid.includes('udp') ? 'udp' : 'tcp'
    const state = (parts[1] ?? 'LISTEN').toUpperCase()
    const local = parts[4] ?? ''

    // Handle both IPv4 (0.0.0.0:80) and IPv6 ([::]:80)
    const lastColonIndex = local.lastIndexOf(':')
    const portStr = lastColonIndex >= 0 ? local.slice(lastColonIndex + 1) : ''
    const port = parseInt(portStr, 10)

    return { protocol, port, state, service: '' }
  }).filter((p) => p.port > 0)
}

function parseNetstat(stdout: string): HostPortRow[] {
  const lines = stdout.split('\n').filter(l => l.includes('LISTEN'))
  return lines.map(line => {
    const parts = line.split(/\s+/).filter(Boolean)
    // netstat format: Proto Recv-Q Send-Q Local Address Foreign Address State
    const protocol = parts[0]?.toLowerCase().includes('tcp') ? 'tcp' : 'udp'
    const local = parts[3] || ''
    const portMatch = local.match(/:(\d+)$/) || local.match(/\.(\d+)$/)
    const port = portMatch ? parseInt(portMatch[1]) : 0
    return { protocol: protocol as 'tcp' | 'udp', port, state: 'LISTEN', service: '' }
  }).filter(p => p.port > 0)
}

