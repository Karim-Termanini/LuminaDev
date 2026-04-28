import { readFileSync, statfsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpus, freemem, homedir, loadavg, tmpdir, totalmem, uptime } from 'node:os'
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
  type ImageRow,
  type JobSummary,
  type NetworkRow,
  type SessionInfo,
  type SystemdRow,
  type VolumeRow,
  CustomProfilesStoreSchema,
  StoreGetRequestSchema,
  StoreSetRequestSchema,
  GitConfigListSchema,
  GitConfigSetSchema,
  SshGenerateSchema,
  SshGetPubSchema,
  SshTestGithubSchema,
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
}

const jobs = new Map<string, JobRecord>()

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
  const model = cpus()[0]?.model ?? 'CPU'
  const metrics: HostMetrics = {
    cpuUsagePercent: sampleCpuUsage(),
    cpuModel: model,
    loadAvg: loadavg(),
    totalMemMb: totalMb,
    freeMemMb: freeMb,
    uptimeSec: Math.round(uptime()),
    diskTotalGb,
    diskFreeGb,
    netRxMbps: rx,
    netTxMbps: tx,
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
      const results = await docker.searchImages({ term })
      return results.map((r: any) => ({
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
    if (req.kind !== 'demo_countdown') throw new Error('Unsupported job kind')
    pruneFinishedJobs()
    const id = randomUUID()
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
      if (!j) {
        return
      }
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
