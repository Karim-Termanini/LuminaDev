import type { ContainerRow, ImageRow, NetworkRow, VolumeRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { DockerSchemeView } from '../components/DockerSchemeView'

type TabId = 'scheme' | 'create' | 'containers' | 'images' | 'volumes' | 'networks' | 'ports' | 'cleanup'

type CreateExample = {
  title: string
  image: string
  command?: string
  ports?: string
  volumes?: string
  env?: string
}

type InstallDistroId = 'ubuntu' | 'fedora' | 'arch'

type InstallStep = {
  label: string
  command: string
}

type InstallDistro = {
  id: InstallDistroId
  title: string
  subtitle: string
  steps: InstallStep[]
}

const CREATE_EXAMPLES: CreateExample[] = [
  { title: 'Nginx web server', image: 'nginx:latest', ports: '8080:80', volumes: './:/usr/share/nginx/html' },
  { title: 'PostgreSQL database', image: 'postgres:16', ports: '5432:5432', env: 'POSTGRES_PASSWORD=postgres\nPOSTGRES_DB=app' },
  { title: 'Redis cache', image: 'redis:7-alpine', ports: '6379:6379' },
  { title: 'MySQL database', image: 'mysql:8', ports: '3306:3306', env: 'MYSQL_ROOT_PASSWORD=root\nMYSQL_DATABASE=app' },
  { title: 'MongoDB', image: 'mongo:7', ports: '27017:27017', env: 'MONGO_INITDB_ROOT_USERNAME=admin\nMONGO_INITDB_ROOT_PASSWORD=admin' },
  { title: 'Ubuntu shell (interactive)', image: 'ubuntu:24.04', command: 'bash' },
  {
    title: 'Python dev container',
    image: 'python:3.12-slim',
    ports: '8000:8000',
    volumes: './:/app',
    env: 'PYTHONDONTWRITEBYTECODE=1',
  },
  {
    title: 'Node.js app',
    image: 'node:20-alpine',
    ports: '3000:3000',
    volumes: './:/app',
    env: 'NODE_ENV=development',
  },
]

const RECOMMENDED_IMAGES = [
  { name: 'nginx', tag: 'latest', description: 'Official build of Nginx.', color: '#009639' },
  { name: 'redis', tag: 'alpine', description: 'Redis is an open source key-value store.', color: '#dc382d' },
  { name: 'postgres', tag: '16', description: 'The World\'s Most Advanced Open Source Relational Database', color: '#336791' },
  { name: 'node', tag: '20-alpine', description: 'Node.js is a JavaScript-based platform for server-side and networking applications.', color: '#339933' },
  { name: 'python', tag: '3.12-slim', description: 'Python is an interpreted, interactive, object-oriented, open-source programming language.', color: '#3776ab' },
  { name: 'mongo', tag: '7', description: 'MongoDB document databases provide high availability and easy scalability.', color: '#47A248' },
]

const INSTALL_DISTROS: InstallDistro[] = [
  {
    id: 'ubuntu',
    title: 'Ubuntu / Debian / Linux Mint',
    subtitle: 'APT-based setup with official Docker repository.',
    steps: [
      {
        label: 'Prepare repository keys',
        command: `apt-get update && apt-get install -y ca-certificates curl && install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc`,
      },
      {
        label: 'Add Docker apt repository',
        command:
          `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && apt-get update`,
      },
      {
        label: 'Install Docker Engine + Compose',
        command: `apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`,
      },
      {
        label: 'Enable service and verify',
        command: `systemctl enable --now docker && docker --version`,
      },
    ],
  },
  {
    id: 'fedora',
    title: 'Fedora / RedHat / CentOS',
    subtitle: 'DNF-based setup with official repository.',
    steps: [
      {
        label: 'Add Docker repository',
        command:
          `dnf -y install dnf-plugins-core && dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo`,
      },
      {
        label: 'Install Docker Engine + Compose',
        command: `dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`,
      },
      {
        label: 'Enable service and verify',
        command: `systemctl enable --now docker && docker --version`,
      },
    ],
  },
  {
    id: 'arch',
    title: 'Arch Linux',
    subtitle: 'pacman-based setup from Arch repositories.',
    steps: [
      {
        label: 'Install Docker packages',
        command: `pacman -S --needed --noconfirm docker docker-compose`,
      },
      {
        label: 'Enable service and verify',
        command: `systemctl enable --now docker && docker --version`,
      },
    ],
  },
]

export function DockerPage(): ReactElement {
  const [tab, setTab] = useState<TabId>('scheme')
  const [docker, setDocker] = useState<
    { ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null
  >(null)
  const [images, setImages] = useState<ImageRow[]>([])
  const [volumes, setVolumes] = useState<VolumeRow[]>([])
  const [networks, setNetworks] = useState<NetworkRow[]>([])
  const [err, setErr] = useState<string>('')
  const [selected, setSelected] = useState<ContainerRow | null>(null)
  const [logText, setLogText] = useState<string>('')
  const [pruneInfo, setPruneInfo] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<string>('')
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [pullImage, setPullImage] = useState('')
  const [customImage, setCustomImage] = useState('nginx:latest')
  const [customName, setCustomName] = useState('')
  const [customPortsText, setCustomPortsText] = useState('8080:80')
  const [customVolumesText, setCustomVolumesText] = useState('')
  const [customEnvText, setCustomEnvText] = useState('')
  const [autoStart, setAutoStart] = useState(true)
  const [remapContainerId, setRemapContainerId] = useState('')
  const [oldHostPort, setOldHostPort] = useState('')
  const [newHostPort, setNewHostPort] = useState('')
  const [createVolumeName, setCreateVolumeName] = useState('')
  const [createNetworkName, setCreateNetworkName] = useState('')
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [selectedDistro, setSelectedDistro] = useState<InstallDistroId | null>(null)
  const [installStep, setInstallStep] = useState<number>(0)
  const [sudoPassword, setSudoPassword] = useState('')
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [installError, setInstallError] = useState<string | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [pruneSelection, setPruneSelection] = useState({ containers: true, images: true, volumes: false, networks: false })
  const [prunePreview, setPrunePreview] = useState<{ containers: number; images: number; volumes: number; networks: number } | null>(null)
  const [installedFeatures, setInstalledFeatures] = useState<{ docker: boolean; compose: boolean; buildx: boolean }>({ docker: false, compose: false, buildx: false })
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['docker', 'compose', 'buildx'])
  const [isScanning, setIsScanning] = useState(false)
  const [hostDistro, setHostDistro] = useState<string>('unknown')
  const [hubResults, setHubResults] = useState<Array<{ name: string; description: string; star_count: number; is_official: boolean }>>([])
  const [isSearchingHub, setIsSearchingHub] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState('latest')
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [activeTermContainer, setActiveTermContainer] = useState<ContainerRow | null>(null)

  const closeTerminal = useCallback(() => setActiveTermContainer(null), [])

  const refreshAll = useCallback(async () => {
    try {
      setErr('')
      const d = (await window.dh.dockerList()) as
        | { ok: true; rows: ContainerRow[] }
        | { ok: false; error: string }
      setDocker(d)
      if (!d.ok) {
        setImages([])
        setVolumes([])
        setNetworks([])
        return
      }
      const img = (await window.dh.dockerImagesList()) as { ok: true; rows: ImageRow[] }
      const vol = (await window.dh.dockerVolumesList()) as { ok: true; rows: VolumeRow[] }
      const net = (await window.dh.dockerNetworksList()) as { ok: true; rows: NetworkRow[] }
      setImages(img.rows)
      setVolumes(vol.rows)
      setNetworks(net.rows)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setDocker({ ok: false, error: message })
      setErr(message)
    }
  }, [])

  useEffect(() => {
    void refreshAll()
    const id = setInterval(() => void refreshAll(), 5000)
    return () => clearInterval(id)
  }, [refreshAll])

  useEffect(() => {
    if (tab === 'cleanup') {
      void previewCleanup()
    }
  }, [tab])

  useEffect(() => {
    if (showInstallModal) {
      void window.dh.getHostDistro().then(setHostDistro)
    }
  }, [showInstallModal])

  useEffect(() => {
    const term = pullImage.trim()
    if (term.length < 2) {
      setHubResults([])
      return
    }
    const id = setTimeout(async () => {
      setIsSearchingHub(true)
      try {
        const res = await window.dh.dockerSearch(term)
        setHubResults(res)
      } catch (e) {
        console.error('Search failed', e)
      } finally {
        setIsSearchingHub(false)
      }
    }, 400)
    return () => clearTimeout(id)
  }, [pullImage])

  async function runScan(): Promise<void> {
    setIsScanning(true)
    try {
      const res = await window.dh.dockerCheckInstalled()
      setInstalledFeatures(res)
      // Auto-select features that are NOT installed
      const toSelect: string[] = []
      if (!res.docker) toSelect.push('docker')
      if (!res.compose) toSelect.push('compose')
      if (!res.buildx) toSelect.push('buildx')
      setSelectedFeatures(toSelect)
      setInstallStep(1)
    } catch (e) {
      console.error('Scan failed', e)
      setInstallStep(1) // Continue anyway
    } finally {
      setIsScanning(false)
    }
  }

  async function runInstallation(): Promise<void> {
    if (!selectedDistro) return
    setInstallBusy(true)
    setInstallError(null)
    setInstallLogs(['Starting installation...'])
    setInstallStep(3) // Move to progress step (mapped to step 3 now)

    try {
      const res = await window.dh.dockerInstall({
        distro: selectedDistro as 'ubuntu' | 'fedora' | 'arch',
        password: sudoPassword,
        components: selectedFeatures
      })
      setInstallLogs(res.log)
      if (res.ok) {
        setInstallStep(4) // Success (mapped to step 4 now)
        void refreshAll()
      } else {
        setInstallError(res.error || 'Unknown error during installation')
      }
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstallBusy(false)
    }
  }

  async function runAction(id: string, action: 'start' | 'stop' | 'restart' | 'remove'): Promise<void> {
    if (action === 'remove') {
      const yes = window.confirm('Remove this stopped container? This cannot be undone.')
      if (!yes) return
    }
    setBusy(true)
    try {
      await window.dh.dockerAction({ id, action })
      await refreshAll()
    } finally {
      setBusy(false)
    }
  }

  async function openLogs(row: ContainerRow): Promise<void> {
    setSelected(row)
    setLogText('Loading logs…')
    const text = (await window.dh.dockerLogs({ id: row.id, tail: 200 })) as string
    setLogText(text || 'No logs')
  }

  async function removeImage(id: string): Promise<void> {
    setBusy(true)
    try {
      await window.dh.dockerImageAction({ id, action: 'remove' })
      await refreshAll()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const canForce = /must be forced|being used by stopped container|conflict/i.test(message)
      if (canForce) {
        const deps = rows.filter((r) => r.imageId === id && r.state.toLowerCase() !== 'running')
        const depText = deps.length > 0 ? `\nStopped containers using it: ${deps.map((d) => d.name).join(', ')}` : ''
        const yes = window.confirm(
          `This image is referenced by stopped containers.${depText}\n\nRemove dependent stopped containers first and retry image delete?`
        )
        if (yes) {
          try {
            for (const dep of deps) {
              await window.dh.dockerAction({ id: dep.id, action: 'remove' })
            }
            await window.dh.dockerImageAction({ id, action: 'remove', force: true })
            await refreshAll()
            setErr('')
          } catch (forceErr) {
            setErr(forceErr instanceof Error ? forceErr.message : String(forceErr))
          }
        } else {
          setErr('Image removal cancelled.')
        }
      } else {
        setErr(message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeVolume(name: string): Promise<void> {
    const usage = volumes.find((v) => v.name === name)?.usedBy ?? []
    if (usage.length > 0) {
      const yes = window.confirm(
        `Volume "${name}" is in use by: ${usage.join(', ')}\nRemoving it may break these containers. Continue?`
      )
      if (!yes) return
    }
    setBusy(true)
    try {
      await window.dh.dockerVolumeAction({ name, action: 'remove' })
      await refreshAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeNetwork(id: string): Promise<void> {
    const usage = networks.find((n) => n.id === id)?.usedBy ?? []
    if (usage.length > 0) {
      const yes = window.confirm(
        `This network is used by: ${usage.join(', ')}\nRemove anyway?`
      )
      if (!yes) return
    }
    setBusy(true)
    try {
      await window.dh.dockerNetworkAction({ id, action: 'remove' })
      await refreshAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runPrune(): Promise<void> {
    setBusy(true)
    try {
      const res = (await window.dh.dockerCleanupRun(pruneSelection)) as { ok: true; reclaimedBytes: number }
      const mb = Math.round((res.reclaimedBytes / (1024 * 1024)) * 10) / 10
      setPruneInfo(`Cleanup finished. Reclaimed ~${mb} MB.`)
      await refreshAll()
      await previewCleanup()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function previewCleanup(): Promise<void> {
    try {
      const res = (await window.dh.dockerPrunePreview()) as {
        ok: true
        preview: { containers: number; images: number; volumes: number; networks: number }
      }
      setPrunePreview(res.preview)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function createCustomVolume(): Promise<void> {
    if (!createVolumeName.trim()) return
    setBusy(true)
    setErr('')
    setCreatedInfo('')
    try {
      await window.dh.dockerVolumeCreate({ name: createVolumeName.trim() })
      setCreatedInfo(`Created volume: ${createVolumeName.trim()}`)
      setCreateVolumeName('')
      await refreshAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function createCustomNetwork(): Promise<void> {
    if (!createNetworkName.trim()) return
    setBusy(true)
    setErr('')
    setCreatedInfo('')
    try {
      await window.dh.dockerNetworkCreate({ name: createNetworkName.trim() })
      setCreatedInfo(`Created network: ${createNetworkName.trim()}`)
      setCreateNetworkName('')
      await refreshAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function applyExampleToForm(example: CreateExample): void {
    const key = `${example.title}-${example.image}`
    const typedName = (customNames[key] ?? '').trim()
    setCustomImage(example.image)
    setCustomName(typedName)
    setCustomPortsText(example.ports ?? '')
    setCustomVolumesText(example.volumes ?? '')
    setCustomEnvText(example.env ?? '')
    setCreatedInfo(`Filled form from example: ${example.title}`)
  }

  async function pullCustomImage(forceImage?: string): Promise<void> {
    const img = forceImage || pullImage.trim()
    if (!img) return
    setBusy(true)
    setErr('')
    setCreatedInfo(`Pulling image: ${img} (this may take a minute)...`)
    try {
      await window.dh.dockerPull({ image: img })
      setCreatedInfo(`Pulled image: ${img}`)
      await refreshAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function createCustomContainer(): Promise<void> {
    setBusy(true)
    setErr('')
    setCreatedInfo('Creating container (this may take a while to pull the image)...')
    try {
      const image = customImage.trim()
      if (!image) throw new Error('Image is required')
      const generated = `hype-${image.replace(/[^a-zA-Z0-9_.:-]/g, '-').replace(/[:/]/g, '-')}-${Date.now().toString().slice(-6)}`
      const ports = parsePortMappings(customPortsText)
      const volumes = parseVolumeMappings(customVolumesText)
      const env = parseEnvLines(customEnvText)
      const res = (await window.dh.dockerCreate({
        image,
        name: customName.trim() || generated,
        ports,
        volumes,
        env,
        autoStart,
      })) as { ok: true; id: string }
      setCreatedInfo(`Created container ${res.id.slice(0, 12)} from ${image}`)
      await refreshAll()
      setTab('containers')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remapPort(): Promise<void> {
    setBusy(true)
    setErr('')
    setCreatedInfo('')
    try {
      if (!remapContainerId) throw new Error('Select container first')
      const oldP = Number(oldHostPort)
      const newP = Number(newHostPort)
      if (!Number.isInteger(oldP) || !Number.isInteger(newP)) {
        throw new Error('Old/New host port must be valid numbers')
      }
      const res = (await window.dh.dockerRemapPort({
        id: remapContainerId,
        oldHostPort: oldP,
        newHostPort: newP,
      })) as { ok: true; name: string }
      setCreatedInfo(`Port remap done. New cloned container: ${res.name}`)
      await refreshAll()
      setTab('containers')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }



  const rows = docker?.ok ? docker.rows : []

  const runningRows = rows.filter((r) => {
    const state = r.state.toLowerCase()
    const status = r.status.toLowerCase()
    return state === 'running' || status.startsWith('up ')
  })
  const stoppedRows = rows.filter((r) => !runningRows.some((x) => x.id === r.id))
  const rowsWithPorts = rows.filter((r) => r.ports !== '—')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          DOCKER.SURFACE
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Docker</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 860 }}>
          Full Docker surface from one click UI: containers, images, volumes, networks, and cleanup.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="hp-btn" onClick={() => void refreshAll()} disabled={busy}>
          Refresh
        </button>
        <button type="button" style={btnWarn} onClick={() => void runPrune()} disabled={busy}>
          Cleanup unused (prune)
        </button>
        <button
          type="button"
          className="hp-btn"
          onClick={() => setShowInstallModal(true)}
        >
          Install / Setup
        </button>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {docker?.ok
            ? `${rows.length} containers • ${images.length} images • ${volumes.length} volumes • ${networks.length} networks`
            : 'docker unavailable'}
        </span>
      </div>

      {pruneInfo ? (
        <div className="hp-status-alert success">
          <span style={{ fontSize: 18 }}>✔</span>
          <span>{pruneInfo}</span>
        </div>
      ) : null}
      {createdInfo ? (
        <div className="hp-status-alert success">
          <span style={{ fontSize: 18 }}>✔</span>
          <span>{createdInfo}</span>
        </div>
      ) : null}
      {err ? (
        <div className="hp-status-alert warning">
          <span style={{ fontSize: 18 }}>⚠</span>
          <span>{err}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['scheme', 'create', 'containers', 'images', 'volumes', 'networks', 'ports', 'cleanup'] as const).map((t) => (
          <button
            key={t}
            type="button"
            style={tab === t ? tabBtnActive : tabBtn}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="hp-card">
        {!docker ? <div style={{ color: 'var(--text-muted)' }}>Checking Docker daemon…</div> : null}
        {docker && !docker.ok ? <div style={{ color: 'var(--orange)' }}>{docker.error}</div> : null}
        {docker?.ok && tab === 'create' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Create from examples. Click <span className="mono">Use</span> to create a new container template.
            </div>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Pull from Docker Hub Explorer</div>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      value={pullImage}
                      onChange={(e) => {
                        setPullImage(e.target.value)
                        setAvailableTags([]) // Reset tags if typing manually
                      }}
                      placeholder="Search images (e.g. redis, postgres, nginx)..."
                      style={{ ...nameInput, marginTop: 0, width: '100%' }}
                      disabled={busy}
                    />
                    {isSearchingHub && (
                      <div className="spinner" style={{ position: 'absolute', right: 12, top: 11, width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                    )}
                  </div>
                  
                  {availableTags.length > 0 && (
                    <select 
                      className="hp-input" 
                      style={{ minWidth: 120 }}
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      disabled={busy}
                    >
                      {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}

                  <button 
                    type="button" 
                    className="hp-btn hp-btn-primary" 
                    onClick={() => {
                      const full = pullImage.includes(':') ? pullImage : `${pullImage}:${selectedTag}`
                      void pullCustomImage(full)
                    }} 
                    disabled={busy || !pullImage || isLoadingTags}
                  >
                    {isLoadingTags ? 'Tags...' : 'Pull Image'}
                  </button>
                </div>

                {hubResults.length > 0 && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, 
                    background: 'var(--bg-panel)', border: '1px solid var(--border)', 
                    borderRadius: 8, marginTop: 4, maxHeight: 300, overflowY: 'auto', 
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)' 
                  }}>
                    {hubResults.map(r => (
                      <div 
                        key={r.name} 
                        style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="hub-result-item"
                        onClick={async () => {
                          setPullImage(r.name)
                          setHubResults([])
                          setIsLoadingTags(true)
                          try {
                            const tags = await window.dh.dockerGetTags(r.name)
                            setAvailableTags(tags)
                            if (tags.includes('latest')) setSelectedTag('latest')
                            else if (tags.length > 0) setSelectedTag(tags[0])
                          } finally {
                            setIsLoadingTags(false)
                          }
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {r.name}
                            {r.is_official && <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>OFFICIAL</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--orange)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                          ★ {r.star_count.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Custom create (ports/env/volumes)</div>
              <div style={formGrid}>
                <input value={customImage} onChange={(e) => setCustomImage(e.target.value)} placeholder="Image" className="hp-input" disabled={busy} />
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Container name (optional)" className="hp-input" disabled={busy} />
                <textarea value={customPortsText} onChange={(e) => setCustomPortsText(e.target.value)} placeholder="Ports: host:container per line (e.g. 8080:80)" className="hp-input" style={{ minHeight: 60 }} />
                <textarea value={customVolumesText} onChange={(e) => setCustomVolumesText(e.target.value)} placeholder="Volumes: /host/path:/container/path per line" className="hp-input" style={{ minHeight: 60 }} />
                <textarea value={customEnvText} onChange={(e) => setCustomEnvText(e.target.value)} placeholder="Env: KEY=VALUE per line" className="hp-input" style={{ minHeight: 60 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
                  Auto start after create
                </label>
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void createCustomContainer()} disabled={busy}>
                  Create custom container
                </button>
              </div>
            </div>
            {CREATE_EXAMPLES.map((ex) => (
              <div
                key={`${ex.title}-${ex.image}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  background: 'var(--bg-input)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{ex.title}</div>
                  <div className="mono" style={{ ...monoCell, maxWidth: 620 }} title={ex.image}>
                    {ex.image}
                    {ex.command ? ` • ${ex.command}` : ''}
                  </div>
                  <input
                    value={customNames[`${ex.title}-${ex.image}`] ?? ''}
                    onChange={(e) =>
                      setCustomNames((prev) => ({
                        ...prev,
                        [`${ex.title}-${ex.image}`]: e.target.value,
                      }))
                    }
                    placeholder="Container name (optional)"
                    className="hp-input"
                    disabled={busy}
                  />
                </div>
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  onClick={() => applyExampleToForm(ex)}
                  disabled={busy}
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {docker?.ok && tab === 'containers' ? (
          rows.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No containers found.</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <ContainerTable
                title={`Running now (${runningRows.length})`}
                rows={runningRows}
                busy={busy}
                onAction={runAction}
                onLogs={openLogs}
                onConsole={(r) => setActiveTermContainer(r)}
              />
              <ContainerTable
                title={`Not running (${stoppedRows.length})`}
                rows={stoppedRows}
                busy={busy}
                onAction={runAction}
                onLogs={openLogs}
                onConsole={(r) => setActiveTermContainer(r)}
              />
              {stoppedRows.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  No stopped containers from current Docker daemon/context.
                </div>
              ) : null}
            </div>
          )
        ) : null}
        {docker?.ok && tab === 'images' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Recommended Images</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {RECOMMENDED_IMAGES.map((rec) => (
                  <div key={rec.name} style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: 8, background: rec.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: 16
                      }}>
                        {rec.name[0].toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{rec.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rec.tag}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>
                      {rec.description}
                    </div>
                    <button type="button" style={{ ...btnSmallPrimary, width: '100%', marginTop: 'auto' }} onClick={() => {
                        const img = `${rec.name}:${rec.tag}`
                        setPullImage(img)
                        void pullCustomImage(img)
                      }} disabled={busy}>
                      PULL
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Downloaded Images</div>
              {images.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No images found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                  {images.map((img) => (
                    <div key={img.id} style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      <div className="mono" style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }} title={img.repoTags.join(', ')}>
                        {img.repoTags.join(', ') || '<none>'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {img.sizeMb} MB • {new Date(img.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button 
                          type="button" 
                          style={{ ...btnSmallPrimary, flex: 1 }} 
                          onClick={() => {
                            setCustomImage(img.repoTags[0] || img.id.slice(0, 12))
                            setTab('create')
                          }} 
                          disabled={busy}
                        >
                          Deploy
                        </button>
                        <button type="button" style={{ ...btnSmallDanger, flex: 1 }} onClick={() => void removeImage(img.id)} disabled={busy}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {docker?.ok && tab === 'volumes' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Create Volume</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={createVolumeName}
                  onChange={(e) => setCreateVolumeName(e.target.value)}
                  placeholder="e.g. my_database_data"
                  style={{ ...nameInput, marginTop: 0, maxWidth: 320 }}
                  disabled={busy}
                />
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void createCustomVolume()} disabled={busy}>
                  Create Volume
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Local Volumes</div>
              {volumes.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No volumes found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {volumes.map((v) => (
                    <div key={v.name} style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      <div className="mono" style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all', color: 'var(--accent)' }} title={v.name}>
                        {v.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                        <span>Driver: <span className="mono">{v.driver}</span></span>
                        <span>Scope: <span className="mono">{v.scope}</span></span>
                      </div>
                      <div className="mono" style={{ fontSize: 11, background: 'var(--bg)', padding: '6px 8px', borderRadius: 6, wordBreak: 'break-all' }} title={v.mountpoint}>
                        {truncateMiddle(v.mountpoint, 60)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {getVolumeDescription(v.name, !!(v.usedBy && v.usedBy.length > 0))}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Used by:{' '}
                        <span className="mono" style={{ fontSize: 11 }}>
                          {v.usedBy && v.usedBy.length > 0 ? v.usedBy.join(', ') : 'unused'}
                        </span>
                      </div>
                      <button type="button" style={{ ...btnSmallDanger, marginTop: 8 }} onClick={() => void removeVolume(v.name)} disabled={busy}>
                        Remove Volume
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {docker?.ok && tab === 'scheme' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <DockerSchemeView containers={rows} networks={networks} />
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Relationship details</div>
              {rows.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No containers found.</div>
              ) : (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 6px' }}>Container</th>
                        <th>Image</th>
                        <th>Networks</th>
                        <th>Volumes</th>
                        <th>Ports</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 6px', fontWeight: 600 }}>{r.name}</td>
                          <td className="mono" style={monoCell} title={r.image}>
                            {r.image}
                          </td>
                          <td className="mono" style={monoCell} title={(r.networks ?? []).join(', ')}>
                            {(r.networks ?? []).length > 0 ? (r.networks ?? []).join(', ') : '—'}
                          </td>
                          <td className="mono" style={monoCell} title={(r.volumes ?? []).join(', ')}>
                            {(r.volumes ?? []).length > 0 ? (r.volumes ?? []).join(', ') : '—'}
                          </td>
                          <td className="mono" style={monoCell} title={r.ports}>{r.ports}</td>
                          <td>{r.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
        {docker?.ok && tab === 'networks' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Create Network</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={createNetworkName}
                  onChange={(e) => setCreateNetworkName(e.target.value)}
                  placeholder="e.g. my_custom_network"
                  style={{ ...nameInput, marginTop: 0, maxWidth: 320 }}
                  disabled={busy}
                />
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void createCustomNetwork()} disabled={busy}>
                  Create Network
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Local Networks</div>
              {networks.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No networks found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {networks.map((n) => (
                    <div key={n.id} style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-all' }}>
                        {n.name}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }} title={n.id}>
                        {n.id.slice(0, 12)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 4 }}>
                        <span>Driver: <span className="mono">{n.driver}</span></span>
                        <span>Scope: <span className="mono">{n.scope}</span></span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {getNetworkDescription(n.name)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Used by:{' '}
                        <span className="mono" style={{ fontSize: 11 }}>
                          {n.usedBy && n.usedBy.length > 0 ? n.usedBy.join(', ') : 'unused'}
                        </span>
                      </div>
                      {n.name === 'bridge' || n.name === 'host' || n.name === 'none' ? (
                        <div style={{ ...systemBadge, marginTop: 8 }}>
                          Protected system network
                        </div>
                      ) : (
                        <button
                          type="button"
                          style={{ ...btnSmallDanger, marginTop: 8 }}
                          onClick={() => void removeNetwork(n.id)}
                          disabled={busy}
                        >
                          Remove Network
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {docker?.ok && tab === 'ports' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Port manager for conflicts: clone container with remapped host port.
            </div>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Current published ports</div>
              {rowsWithPorts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No containers with published ports.</div>
              ) : (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 6px' }}>Container</th>
                        <th>State</th>
                        <th>Ports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsWithPorts.map((r) => (
                        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 6px', fontWeight: 600 }}>{r.name}</td>
                          <td>{r.state}</td>
                          <td className="mono" style={monoCell} title={r.ports}>{r.ports}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="hp-card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Remap host port</div>
              <div style={formGrid}>
                <select
                  value={remapContainerId}
                  onChange={(e) => setRemapContainerId(e.target.value)}
                  className="hp-input"
                >
                  <option value="">Select container</option>
                  {rowsWithPorts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.ports})
                    </option>
                  ))}
                </select>
                <input value={oldHostPort} onChange={(e) => setOldHostPort(e.target.value)} placeholder="Old host port (e.g. 8080)" className="hp-input" />
                <input value={newHostPort} onChange={(e) => setNewHostPort(e.target.value)} placeholder="New host port (e.g. 8081)" className="hp-input" />
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void remapPort()} disabled={busy}>
                  Remap (clone + start)
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {tab === 'cleanup' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="hp-card">
              <h3 style={{ margin: 0, fontSize: 18 }}>Guided System Cleanup</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Free up disk space by removing unused Docker resources. Select what to prune:
              </p>
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={pruneSelection.containers} onChange={e => setPruneSelection(p => ({ ...p, containers: e.target.checked }))} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Prune Stopped Containers</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Removes all containers that are not currently running.</div>
                  </div>
                </label>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={pruneSelection.images} onChange={e => setPruneSelection(p => ({ ...p, images: e.target.checked }))} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Prune Unused Images</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Removes images that are not referenced by any containers.</div>
                  </div>
                </label>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={pruneSelection.volumes} onChange={e => setPruneSelection(p => ({ ...p, volumes: e.target.checked }))} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Prune Unused Volumes</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Removes all local volumes not used by at least one container.</div>
                  </div>
                </label>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={pruneSelection.networks} onChange={e => setPruneSelection(p => ({ ...p, networks: e.target.checked }))} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Prune Unused Networks</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Removes all networks not used by at least one container.</div>
                  </div>
                </label>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Dry-run preview</div>
                {!prunePreview ? (
                  <button type="button" className="hp-btn" onClick={() => void previewCleanup()} disabled={busy}>
                    Load preview
                  </button>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 8 }}>
                    <div style={previewCard}>
                      <div style={previewLabel}>Containers</div>
                      <div style={previewValue}>{prunePreview.containers}</div>
                    </div>
                    <div style={previewCard}>
                      <div style={previewLabel}>Images</div>
                      <div style={previewValue}>{prunePreview.images}</div>
                    </div>
                    <div style={previewCard}>
                      <div style={previewLabel}>Volumes</div>
                      <div style={previewValue}>{prunePreview.volumes}</div>
                    </div>
                    <div style={previewCard}>
                      <div style={previewLabel}>Networks</div>
                      <div style={previewValue}>{prunePreview.networks}</div>
                    </div>
                  </div>
                )}
              </div>
              <button 
                type="button" 
                style={{ ...btnPrimary, marginTop: 20, width: '100%', padding: '12px' }}
                onClick={() => void runPrune()}
                disabled={busy || !Object.values(pruneSelection).some(v => v)}
              >
                Run Selected Cleanup
              </button>
            </div>

            <div style={{ ...sectionBox, border: '1px solid var(--orange)' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--orange)' }}>Safety note</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Cleanup only removes resources Docker reports as unused. Running containers are not removed.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {showInstallModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, maxWidth: 600, minHeight: 450, background: 'var(--bg-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>D</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Docker Setup Wizard</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Step {installStep + 1} of 5</div>
                </div>
              </div>
              <button type="button" style={closeBtn} onClick={() => setShowInstallModal(false)}>×</button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {installStep === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ margin: 0, fontSize: 14 }}>Welcome to the Docker Engine Installation Wizard. This tool will automate the setup on your host machine.</p>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Select your Linux distribution:</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {INSTALL_DISTROS.map((d) => (
                      <label key={d.id} className="hp-card" style={{ 
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', 
                        borderColor: selectedDistro === d.id ? 'var(--accent)' : 'var(--border)',
                        background: selectedDistro === d.id ? 'rgba(124, 77, 255, 0.05)' : 'var(--bg-input)'
                      }}>
                        <input type="radio" name="distro" checked={selectedDistro === d.id} onChange={() => setSelectedDistro(d.id)} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.subtitle}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {selectedDistro && hostDistro !== 'unknown' && selectedDistro !== hostDistro && (
                    <div style={{ ...sectionBox, background: 'rgba(244, 67, 54, 0.1)', borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13, padding: '12px' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ OS Mismatch Detected</div>
                      You selected <strong>{INSTALL_DISTROS.find(d => d.id === selectedDistro)?.title}</strong>, but we detected you are running <strong>{hostDistro.charAt(0).toUpperCase() + hostDistro.slice(1)}</strong>. Installing for the wrong distribution may break your system!
                    </div>
                  )}
                </div>
              )}

              {installStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Select Components</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                    We scanned your system and found some components are already installed.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { id: 'docker', title: 'Docker Engine', desc: 'Core daemon and CLI tools.' },
                      { id: 'compose', title: 'Docker Compose', desc: 'Tool for defining and running multi-container apps.' },
                      { id: 'buildx', title: 'Docker Buildx', desc: 'Extended build capabilities with BuildKit.' }
                    ].map(feat => {
                      const isInstalled = installedFeatures[feat.id as keyof typeof installedFeatures]
                      return (
                        <label key={feat.id} className="hp-card" style={{ 
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', 
                          opacity: isInstalled ? 0.6 : 1,
                          cursor: isInstalled ? 'default' : 'pointer',
                          background: selectedFeatures.includes(feat.id) ? 'rgba(124, 77, 255, 0.05)' : 'var(--bg-input)'
                        }}>
                          <input 
                            type="checkbox" 
                            checked={selectedFeatures.includes(feat.id) || isInstalled} 
                            disabled={isInstalled} 
                            onChange={() => {
                              if (selectedFeatures.includes(feat.id)) setSelectedFeatures(prev => prev.filter(x => x !== feat.id))
                              else setSelectedFeatures(prev => [...prev, feat.id])
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600 }}>{feat.title}</span>
                              {isInstalled && <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(76, 175, 80, 0.1)', padding: '2px 6px', borderRadius: 4 }}>INSTALLED</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{feat.desc}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {installStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Authentication Required</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                    Installation requires root privileges. Please enter your <strong>sudo</strong> password to proceed.
                    This password is only used to run the installation commands and is not stored.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Sudo Password</label>
                    <input 
                      type="password" 
                      className="hp-input" 
                      placeholder="••••••••" 
                      value={sudoPassword} 
                      onChange={e => setSudoPassword(e.target.value)} 
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && runInstallation()}
                    />
                  </div>
                  <div style={{ ...sectionBox, background: 'rgba(255, 159, 67, 0.05)', borderColor: 'rgba(255, 159, 67, 0.2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--orange)' }}>⚠️ Ensure your user has sudo privileges on the host machine.</div>
                  </div>
                </div>
              )}

              {installStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Installing Docker...</h3>
                    {installBusy && <div className="spinner" style={{ width: 20, height: 20, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }} />}
                  </div>
                  <div style={{ 
                    flex: 1, 
                    background: '#000', 
                    borderRadius: 8, 
                    padding: 12, 
                    fontFamily: 'monospace', 
                    fontSize: 11, 
                    color: '#0f0', 
                    overflowY: 'auto', 
                    maxHeight: 240, 
                    minHeight: 200 
                  }}>
                    {installLogs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
                    {installError && <div style={{ color: 'var(--red)', marginTop: 8, fontWeight: 700 }}>Error: {installError}</div>}
                  </div>
                  {installError && (
                    <button className="hp-btn hp-btn-danger" onClick={() => setInstallStep(2)}>Retry Step</button>
                  )}
                </div>
              )}

              {installStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ width: 64, height: 64, background: 'var(--green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, marginBottom: 12 }}>✔</div>
                  <h2 style={{ margin: 0 }}>Installation Complete!</h2>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', maxWidth: 400 }}>
                    Docker Engine has been successfully installed and started. You can now manage containers directly from this dashboard.
                  </p>
                  <div style={{ ...sectionBox, textAlign: 'left', width: '100%' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Next Steps:</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <li>Refresh the dashboard to detect the daemon.</li>
                      <li>Run <code>docker version</code> in your host terminal to verify.</li>
                      <li>If access is denied, log out and back in to refresh group permissions.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              {installStep === 0 && (
                <button className="hp-btn hp-btn-primary" disabled={!selectedDistro || isScanning} onClick={() => void runScan()}>
                  {isScanning ? 'Scanning...' : 'Next >'}
                </button>
              )}
              {installStep === 1 && (
                <>
                  <button className="hp-btn" onClick={() => setInstallStep(0)}>{'<'}- Back</button>
                  <button className="hp-btn hp-btn-primary" disabled={selectedFeatures.length === 0} onClick={() => setInstallStep(2)}>Next {'>'}</button>
                </>
              )}
              {installStep === 2 && (
                <>
                  <button className="hp-btn" onClick={() => setInstallStep(1)}>{'<'}- Back</button>
                  <button className="hp-btn hp-btn-primary" disabled={!sudoPassword} onClick={() => void runInstallation()}>Install Now</button>
                </>
              )}
              {(installStep === 3 && !installBusy) && (
                 <button className="hp-btn" onClick={() => setInstallStep(0)}>Abort</button>
              )}
              {installStep === 4 && (
                <button className="hp-btn hp-btn-primary" onClick={() => setShowInstallModal(false)}>Finish</button>
              )}
            </div>
          </div>
        </div>
      )}



      {selected ? (
        <section className="hp-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Logs: {selected.name}</div>
            <button type="button" className="hp-btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <pre className="mono" style={pre}>{logText}</pre>
        </section>
      ) : null}

      {activeTermContainer && (
        <DockerTerminalModal 
          container={activeTermContainer} 
          onClose={closeTerminal} 
        />
      )}
    </div>
  )
}





const btnWarn = {
  border: '1px solid var(--orange)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const btnPrimary = {
  border: '1px solid var(--accent)',
  background: 'var(--bg-input)',
  color: 'var(--accent)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}



const btnSmallPrimary = {
  border: '1px solid var(--accent)',
  background: 'var(--bg-input)',
  color: 'var(--accent)',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 12,
}

const btnSmallDanger = {
  border: '1px solid var(--orange)',
  background: 'var(--bg-input)',
  color: 'var(--orange)',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 12,
}

const tabBtn = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: 12,
  textTransform: 'capitalize' as const,
}

const tabBtnActive = {
  ...tabBtn,
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
}

const tableWrap = {
  width: '100%',
  overflowX: 'auto' as const,
}

const table = {
  width: '100%',
  minWidth: 760,
  borderCollapse: 'collapse' as const,
  fontSize: 13,
  tableLayout: 'fixed' as const,
}

const monoCell = {
  fontSize: 11,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const nameInput = {
  marginTop: 6,
  width: '100%',
  maxWidth: 320,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
}



const checkboxLabel = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 16px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'border-color 0.2s',
}

const previewCard = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--bg-input)',
}

const previewLabel = {
  fontSize: 11,
  color: 'var(--text-muted)',
}

const previewValue = {
  fontSize: 22,
  fontWeight: 700,
  marginTop: 4,
}

const systemBadge = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text-muted)',
  background: 'var(--bg)',
  textAlign: 'center' as const,
}



const modalOverlay = {
  position: 'fixed' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 20,
}

const modalContent = {
  width: '100%',
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  display: 'flex',
  flexDirection: 'column' as const,
}

const closeBtn = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: 24,
  cursor: 'pointer',
}

const sectionBox = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 10,
  background: 'var(--bg-input)',
}

const formGrid = {
  display: 'grid',
  gap: 8,
}

const pre = {
  margin: '12px 0 0 0',
  padding: 12,
  background: '#0a0a0a',
  border: '1px solid var(--border)',
  borderRadius: 8,
  maxHeight: 420,
  overflow: 'auto' as const,
  whiteSpace: 'pre-wrap' as const,
  fontSize: 12,
}

function truncateMiddle(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input
  const side = Math.max(8, Math.floor((maxLen - 1) / 2))
  return `${input.slice(0, side)}…${input.slice(-side)}`
}

function parsePortMappings(text: string): Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const out: Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }> = []
  for (const line of lines) {
    const [pair, protoRaw] = line.split('/')
    const [hostRaw, containerRaw] = pair.split(':')
    const hostPort = Number(hostRaw)
    const containerPort = Number(containerRaw)
    if (!Number.isInteger(hostPort) || !Number.isInteger(containerPort)) {
      throw new Error(`Invalid port mapping: ${line}. Use host:container, e.g. 8080:80`)
    }
    const protocol = protoRaw === 'udp' ? 'udp' : 'tcp'
    out.push({ hostPort, containerPort, protocol })
  }
  return out
}

function parseVolumeMappings(text: string): Array<{ hostPath: string; containerPath: string }> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const idx = line.indexOf(':')
    if (idx <= 0 || idx >= line.length - 1) {
      throw new Error(`Invalid volume mapping: ${line}. Use /host/path:/container/path`)
    }
    return { hostPath: line.slice(0, idx), containerPath: line.slice(idx + 1) }
  })
}

function getNetworkDescription(name: string): string {
  if (name === 'bridge') return 'Default network. Connects containers together and provides internet access.'
  if (name === 'host') return 'Removes network isolation. Containers share the host’s exact IP and ports.'
  if (name === 'none') return 'Completely disables networking. Container has no internet or local access.'
  if (name.endsWith('_default')) return 'Custom bridge network (usually created by Docker Compose) to isolate an app.'
  return 'User-created custom network.'
}

function getVolumeDescription(name: string, isUsed: boolean): string {
  if (name.length === 64 && !name.includes('_')) {
    return isUsed 
      ? 'Anonymous Volume. Automatically created by a running container to store internal data.'
      : 'Unused Anonymous Volume. Leftover data from a deleted container. Safe to remove if unneeded.'
  }
  return 'Named Volume. Specifically created to persist important database or application data safely.'
}

function parseEnvLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

type ContainerTableProps = {
  title: string
  rows: ContainerRow[]
  busy: boolean
  onAction: (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<void>
  onLogs: (row: ContainerRow) => Promise<void>
}

function ContainerTable(props: ContainerTableProps & { onConsole: (row: ContainerRow) => void }): ReactElement {
  const { title, rows, busy, onAction, onLogs, onConsole } = props
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No containers in this group.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {rows.map((r) => {
            const isRunning = r.state.toLowerCase() === 'running'
            return (
              <div key={r.id} className="hp-card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ 
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                    background: isRunning ? 'var(--green)' : 'var(--text-muted)' 
                  }} title={r.state} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.image}>{r.image}</div>
                  </div>
                </div>
                
                {r.ports !== '—' && (
                  <div className="mono" style={{ fontSize: 11, background: 'var(--bg)', padding: '6px 8px', borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }} title={r.ports}>
                    {r.ports.split(',').map((p, idx) => {
                      const part = p.trim()
                      const hostPortMatch = part.match(/^(\d+):/)
                      if (hostPortMatch && isRunning) {
                        const hp = hostPortMatch[1]
                        return (
                          <a 
                            key={idx} 
                            href={`http://localhost:${hp}`} 
                            onClick={(e) => { e.preventDefault(); void window.dh.openExternal(`http://localhost:${hp}`) }}
                            style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px dashed var(--accent)' }}
                          >
                            {part}
                          </a>
                        )
                      }
                      return <span key={idx}>{part}</span>
                    })}
                  </div>
                )}
                
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 4 }}>
                  <button type="button" className="hp-btn" onClick={() => void onAction(r.id, isRunning ? 'stop' : 'start')} disabled={busy}>
                    {isRunning ? 'Stop' : 'Start'}
                  </button>
                  {isRunning && (
                    <button type="button" className="hp-btn" onClick={() => void onAction(r.id, 'restart')} disabled={busy}>
                      Restart
                    </button>
                  )}
                  <button type="button" className="hp-btn" onClick={() => void onLogs(r)} disabled={busy}>
                    Logs
                  </button>
                  {isRunning && (
                    <button type="button" className="hp-btn" onClick={() => onConsole(r)} disabled={busy}>
                      Console
                    </button>
                  )}
                  {!isRunning ? (
                    <button type="button" className="hp-btn hp-btn-danger" onClick={() => void onAction(r.id, 'remove')} disabled={busy}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


function DockerTerminalModal({ container, onClose }: { container: ContainerRow; onClose: () => void }): ReactElement {
  const termWrapRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!termWrapRef.current) return
    const el = termWrapRef.current

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      theme: { background: '#0a0a0a', foreground: '#e8e8e8', cursor: '#7c4dff' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    term.focus()
    xtermRef.current = term

    let tid: string | undefined = undefined

    void (async () => {
      const res = await window.dh.dockerTerminal({
        containerId: container.id,
        cols: term.cols,
        rows: term.rows
      })
      if (!res.ok) {
        term.writeln(`\r\nError creating terminal: ${res.error}`)
        return
      }
      tid = res.id

      const offOut = window.dh.onTerminalData(({ id, data }) => {
        if (id === tid) term.write(data)
      })
      const offExit = window.dh.onTerminalExit(({ id }) => {
        if (id === tid) {
          term.writeln('\r\nProcess exited.')
          setTimeout(onClose, 1000)
        }
      })

      term.onData((data) => {
        if (tid) window.dh.terminalWrite(tid, data)
      })
      term.onResize(({ cols, rows }) => {
        if (tid) window.dh.terminalResize(tid, cols, rows)
      })

      return () => {
        offOut()
        offExit()
      }
    })()

    const handleResize = () => fit.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [container.id, onClose])

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalContent, width: '90%', height: '80%', maxWidth: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>Terminal: {container.name}</div>
          <button onClick={onClose} style={closeBtn}>&times;</button>
        </div>
        <div ref={termWrapRef} style={{ flex: 1, background: '#0a0a0a', borderRadius: 8, padding: 8, overflow: 'hidden' }} />
      </div>
    </div>
  )
}
