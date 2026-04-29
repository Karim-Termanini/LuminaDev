import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import Docker from 'dockerode'
import simpleGit from 'simple-git'

const execFileAsync = promisify(execFile)
const docker = new Docker()

const channel = process.argv[2]
const rawPayload = process.argv[3] ?? '{}'
const payload = parseJson(rawPayload, {})

function parseJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function out(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function run(cmd, args = [], opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, opts)
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') }
  } catch (e) {
    return { ok: false, stdout: String(e.stdout || ''), stderr: String(e.stderr || e.message || '') }
  }
}

function findRepoRoot(start = process.cwd()) {
  let cur = start
  for (let i = 0; i < 8; i += 1) {
    const marker = path.join(cur, 'docker', 'compose')
    if (fs.existsSync(marker)) return cur
    cur = path.dirname(cur)
  }
  return process.cwd()
}

async function handle() {
  switch (channel) {
    case 'dh:docker:list': {
      try {
        const items = await docker.listContainers({ all: true })
        const rows = items.map((c) => ({
          id: c.Id,
          name: c.Names?.[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
          image: c.Image,
          imageId: c.ImageID,
          state: c.State || 'unknown',
          status: c.Status || 'unknown',
          ports: (c.Ports || []).map((p) => `${p.PublicPort || '-'}:${p.PrivatePort}/${p.Type}`).join(', ') || '—',
          networks: c.NetworkSettings?.Networks ? Object.keys(c.NetworkSettings.Networks) : [],
          volumes: [],
        }))
        return out({ ok: true, rows })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_LIST_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:action': {
      try {
        const ctr = docker.getContainer(payload.id)
        const action = payload.action
        if (action === 'start') await ctr.start()
        else if (action === 'stop') await ctr.stop()
        else if (action === 'restart') await ctr.restart()
        else if (action === 'remove') await ctr.remove({ force: true })
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_ACTION_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:logs': {
      try {
        const ctr = docker.getContainer(payload.id)
        const buf = await ctr.logs({ stdout: true, stderr: true, tail: payload.tail || 200 })
        return out({ ok: true, log: String(buf || '') })
      } catch (e) {
        return out({ ok: false, log: '', error: `[DOCKER_LOGS_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:images:list': {
      try {
        const images = await docker.listImages()
        return out({
          ok: true,
          rows: images.map((i) => ({
            id: i.Id,
            repoTags: i.RepoTags || [],
            sizeMb: Math.round((i.Size || 0) / 1024 / 1024),
            createdAt: i.Created || 0,
          })),
        })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_IMAGES_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:image:action': {
      try {
        if (payload.action === 'remove') await docker.getImage(payload.id).remove({ force: !!payload.force })
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_IMAGE_ACTION_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:volumes:list': {
      try {
        const res = await docker.listVolumes()
        const rows = (res.Volumes || []).map((v) => ({
          name: v.Name,
          driver: v.Driver,
          mountpoint: v.Mountpoint,
          scope: v.Scope || 'local',
          usedBy: [],
        }))
        return out({ ok: true, rows })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_VOLUMES_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:volume:create': {
      try {
        await docker.createVolume({ Name: payload.name })
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_VOLUME_CREATE_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:volume:action': {
      try {
        if (payload.action === 'remove') await docker.getVolume(payload.name).remove()
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_VOLUME_ACTION_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:networks:list': {
      try {
        const nets = await docker.listNetworks()
        const rows = nets.map((n) => ({ id: n.Id, name: n.Name, driver: n.Driver, scope: n.Scope || 'local', usedBy: [] }))
        return out({ ok: true, rows })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_NETWORKS_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:network:create': {
      try {
        await docker.createNetwork({ Name: payload.name, Driver: 'bridge' })
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_NETWORK_CREATE_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:network:action': {
      try {
        if (payload.action === 'remove') await docker.getNetwork(payload.id).remove()
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_NETWORK_ACTION_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:prune': {
      try {
        const containers = await docker.pruneContainers()
        const images = await docker.pruneImages()
        const volumes = await docker.pruneVolumes()
        const networks = await docker.pruneNetworks()
        return out({ ok: true, result: { containers, images, volumes, networks } })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_PRUNE_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:prune:preview': {
      try {
        const [containers, images, volumes, networks] = await Promise.all([
          docker.listContainers({ all: true }),
          docker.listImages(),
          docker.listVolumes(),
          docker.listNetworks(),
        ])
        return out({
          ok: true,
          preview: {
            containers: containers.filter((c) => c.State !== 'running').length,
            images: images.filter((i) => (i.RepoTags || []).includes('<none>:<none>')).length,
            volumes: (volumes.Volumes || []).length,
            networks: networks.filter((n) => !['bridge', 'host', 'none'].includes(n.Name)).length,
          },
        })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_PRUNE_PREVIEW_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:cleanup:run': {
      try {
        if (payload.containers) await docker.pruneContainers()
        if (payload.images) await docker.pruneImages()
        if (payload.volumes) await docker.pruneVolumes()
        if (payload.networks) await docker.pruneNetworks()
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_CLEANUP_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:pull': {
      try {
        await new Promise((resolve, reject) => {
          docker.pull(payload.image, (err, stream) => {
            if (err || !stream) return reject(err || new Error('No stream'))
            docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()))
          })
        })
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[DOCKER_PULL_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:docker:search': {
      const term = String(payload || '')
      const res = await fetch(`https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page_size=12`)
      const body = await res.json()
      return out({
        ok: true,
        results: (body.results || []).map((r) => ({
          name: r.repo_name,
          description: r.short_description || '',
          star_count: r.star_count || 0,
          is_official: !!r.is_official,
        })),
      })
    }
    case 'dh:docker:tags': {
      const image = String(payload || '')
      const namespace = image.includes('/') ? image.split('/')[0] : 'library'
      const repo = image.includes('/') ? image.split('/').slice(1).join('/') : image
      const res = await fetch(`https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags/?page_size=20`)
      const body = await res.json()
      return out({ ok: true, tags: (body.results || []).map((x) => x.name).filter(Boolean) })
    }
    case 'dh:metrics': {
      const la = os.loadavg()
      return out({
        ok: true,
        metrics: {
          cpuUsagePercent: 0,
          cpuModel: os.cpus()[0]?.model || 'unknown',
          loadAvg: la,
          totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemMb: Math.round(os.freemem() / 1024 / 1024),
          swapTotalMb: 0,
          swapFreeMb: 0,
          uptimeSec: os.uptime(),
          diskTotalGb: 0,
          diskFreeGb: 0,
          diskReadMbps: 0,
          diskWriteMbps: 0,
          netRxMbps: 0,
          netTxMbps: 0,
        },
        systemd: [],
      })
    }
    case 'dh:host:exec': {
      const cmd = payload.command
      if (cmd === 'nvidia_smi_short') {
        const r = await run('bash', ['-lc', 'nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1'])
        return out({ ok: r.ok, result: r.ok ? (r.stdout.trim() || 'GPU: unavailable') : null, error: r.ok ? undefined : r.stderr })
      }
      if (cmd === 'systemctl_is_active') {
        const unit = payload.unit ? String(payload.unit) : ''
        const r = await run('systemctl', ['is-active', unit])
        return out({ ok: true, result: r.ok ? r.stdout.trim() : 'unknown' })
      }
      return out({ ok: false, result: null, error: '[HOST_EXEC_NOT_ALLOWED] command not allowed' })
    }
    case 'dh:compose:up':
    case 'dh:compose:logs': {
      const repoRoot = findRepoRoot()
      const profile = String(payload.profile || 'web-dev')
      const cwd = path.join(repoRoot, 'docker', 'compose', profile)
      const args = channel.endsWith(':up') ? ['compose', 'up', '-d'] : ['compose', 'logs', '--tail', '200']
      const r = await run('docker', args, { cwd })
      return out({ ok: r.ok, log: `${r.stdout}${r.stderr}`.trim(), error: r.ok ? undefined : `[DOCKER_COMPOSE_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:git:clone': {
      const git = simpleGit()
      try {
        await git.clone(payload.url, payload.targetDir)
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[GIT_CLONE_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:git:status': {
      try {
        const git = simpleGit(payload.repoPath)
        const status = await git.status()
        return out({
          ok: true,
          info: {
            branch: status.current || 'unknown',
            tracking: status.tracking || null,
            ahead: status.ahead || 0,
            behind: status.behind || 0,
            modified: status.modified.length,
            created: status.created.length,
            deleted: status.deleted.length,
          },
        })
      } catch (e) {
        return out({ ok: false, error: `[GIT_STATUS_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:git:recent:list':
    case 'dh:git:recent:add': {
      const file = path.join(os.homedir(), '.config', 'luminadev', 'git-recent.json')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      let repos = []
      if (fs.existsSync(file)) repos = parseJson(fs.readFileSync(file, 'utf-8'), [])
      if (channel.endsWith(':add')) {
        const p = String(payload.path || '')
        repos = [{ path: p, lastOpened: Date.now() }, ...repos.filter((r) => r.path !== p)].slice(0, 30)
        fs.writeFileSync(file, JSON.stringify(repos, null, 2))
        return out({ ok: true })
      }
      return out({ ok: true, repos })
    }
    case 'dh:git:config:set': {
      try {
        const git = simpleGit()
        await git.addConfig('user.name', payload.name, false, 'global')
        await git.addConfig('user.email', payload.email, false, 'global')
        if (payload.defaultBranch) await git.addConfig('init.defaultBranch', payload.defaultBranch, false, 'global')
        if (payload.defaultEditor) await git.addConfig('core.editor', payload.defaultEditor, false, 'global')
        return out({ ok: true })
      } catch (e) {
        return out({ ok: false, error: `[GIT_CONFIG_SET_FAILED] ${String(e.message || e)}` })
      }
    }
    case 'dh:git:config:list': {
      const git = simpleGit()
      const r = await git.raw(['config', '--global', '--list'])
      const rows = r.split('\n').filter(Boolean).map((line) => {
        const i = line.indexOf('=')
        return { key: line.slice(0, i), value: line.slice(i + 1) }
      })
      return out({ ok: true, rows })
    }
    case 'dh:ssh:generate': {
      const email = payload.email ? String(payload.email) : 'lumina@local'
      const target = path.join(os.homedir(), '.ssh', 'id_ed25519')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const r = await run('ssh-keygen', ['-t', 'ed25519', '-C', email, '-f', target, '-N', ''])
      return out({ ok: r.ok, error: r.ok ? undefined : `[SSH_GENERATE_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:ssh:get:pub': {
      const pubPath = path.join(os.homedir(), '.ssh', 'id_ed25519.pub')
      if (!fs.existsSync(pubPath)) return out({ ok: false, pub: '', fingerprint: '', error: '[SSH_KEY_NOT_FOUND] Missing public key.' })
      const pub = fs.readFileSync(pubPath, 'utf-8').trim()
      const fp = await run('ssh-keygen', ['-lf', pubPath])
      return out({ ok: true, pub, fingerprint: fp.ok ? fp.stdout.trim() : '' })
    }
    case 'dh:ssh:test:github': {
      const r = await run('ssh', ['-T', 'git@github.com'], { timeout: 12000 })
      const output = `${r.stdout}${r.stderr}`
      return out({ ok: true, output, code: r.ok ? 0 : 1 })
    }
    case 'dh:ssh:list:dir': {
      const port = String(payload.port || 22)
      const remote = `${payload.user}@${payload.host}`
      const rp = String(payload.remotePath || '.')
      const r = await run('ssh', ['-p', port, remote, `ls -1 ${rp}`])
      return out({ ok: r.ok, entries: r.ok ? r.stdout.split('\n').filter(Boolean) : [], error: r.ok ? undefined : `[SSH_LIST_DIR_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:ssh:setup:remote:key': {
      const port = String(payload.port || 22)
      const remote = `${payload.user}@${payload.host}`
      const key = String(payload.publicKey || '').replace(/'/g, "'\"'\"'")
      const r = await run('ssh', ['-p', port, remote, `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${key}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`])
      return out({ ok: r.ok, error: r.ok ? undefined : `[SSH_SETUP_KEY_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:host:ports': {
      const r = await run('bash', ['-lc', "ss -tulpnH | awk '{print $1\" \"$5\" \"$2}'"])
      const rows = r.ok
        ? r.stdout.split('\n').filter(Boolean).map((line) => {
            const parts = line.trim().split(/\s+/)
            const proto = parts[0].startsWith('udp') ? 'udp' : 'tcp'
            const port = Number(parts[1].split(':').at(-1) || 0)
            return { protocol: proto, port, state: 'LISTEN', service: parts[2] || '' }
          })
        : []
      return out({ ok: r.ok, ports: rows, error: r.ok ? undefined : `[HOST_PORTS_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:host:sysinfo': {
      return out({
        ok: true,
        info: {
          hostname: os.hostname(),
          os: os.platform(),
          kernel: os.release(),
          arch: os.arch(),
          uptime: Math.round(os.uptime()),
          shell: process.env.SHELL || '',
          memoryUsage: `${Math.round((1 - os.freemem() / os.totalmem()) * 100)}%`,
        },
      })
    }
    case 'dh:monitor:top-processes': {
      const r = await run('bash', ['-lc', "ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 15"])
      const lines = r.ok ? r.stdout.split('\n').slice(1).filter(Boolean) : []
      const processes = lines.map((l) => {
        const p = l.trim().split(/\s+/)
        return { pid: Number(p[0]), command: p[1] || '', cpuPercent: Number(p[2] || 0), memPercent: Number(p[3] || 0) }
      })
      return out({ ok: true, processes, error: r.ok ? undefined : `[MONITOR_TOP_FAILED] ${r.stderr.trim()}` })
    }
    case 'dh:monitor:security': {
      return out({
        ok: true,
        snapshot: {
          firewall: 'unknown',
          selinux: 'unknown',
          sshPermitRootLogin: 'unknown',
          sshPasswordAuth: 'unknown',
          failedAuth24h: 0,
          riskyOpenPorts: [],
        },
      })
    }
    case 'dh:monitor:security-drilldown': {
      return out({ ok: true, drilldown: { failedAuthSamples: [], riskyPortOwners: [] } })
    }
    case 'dh:runtime:status': {
      const runtimes = [
        ['node', 'Node.js', 'node --version'],
        ['python', 'Python', 'python3 --version'],
        ['java', 'Java', 'java -version'],
        ['go', 'Go', 'go version'],
        ['rust', 'Rust', 'rustc --version'],
      ]
      const rows = []
      for (const [id, name, check] of runtimes) {
        const r = await run('bash', ['-lc', check])
        rows.push({ id, name, installed: r.ok, version: r.ok ? (r.stdout || r.stderr).trim() : undefined })
      }
      return out({ ok: true, runtimes: rows })
    }
    case 'dh:runtime:get-versions':
      return out({ ok: true, versions: [] })
    case 'dh:runtime:check-deps':
      return out({ ok: true, dependencies: [] })
    case 'dh:runtime:uninstall:preview':
      return out({ ok: true, note: 'Preview unavailable in bridge mode.' })
    case 'dh:diagnostics:bundle:create': {
      const includeSensitive = !!payload.includeSensitive
      const report = payload.report || {}
      const dir = path.join(os.homedir(), '.config', 'luminadev', 'diagnostics')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `diag-${Date.now()}.json`)
      fs.writeFileSync(file, JSON.stringify({ includeSensitive, report, createdAt: new Date().toISOString() }, null, 2))
      return out({ ok: true, path: file })
    }
    case 'dh:dialog:folder':
    case 'dh:dialog:file:open':
    case 'dh:dialog:file:save':
    case 'dh:docker:install':
    case 'dh:docker:terminal':
    case 'dh:docker:remap-port':
      return out({ ok: false, error: `[TAURI_NOT_IMPLEMENTED] ${channel} is not ported yet.` })
    default:
      return out({ ok: false, error: `[UNKNOWN_CHANNEL] ${channel}` })
  }
}

await handle()
