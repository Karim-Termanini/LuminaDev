import type {
  ContainerInspectData,
  ContainerRow,
  ImageRow,
  NetworkRow,
  VolumeRow,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { DockerSchemeView } from '../components/DockerSchemeView'
import { assertDockerOk } from './dockerContract'
import { humanizeDockerError } from './dockerError'
import './DockerPage.css'

type TabId =
  | 'scheme'
  | 'create'
  | 'containers'
  | 'images'
  | 'volumes'
  | 'networks'
  | 'ports'
  | 'cleanup'

type CreateExample = {
  title: string
  image: string
  command?: string
  ports?: string
  volumes?: string
  env?: string
}

type InstallDistroId = 'ubuntu' | 'fedora' | 'arch'

const DOCKER_ENGINE_INSTALL_DOCS = 'https://docs.docker.com/engine/install/'

const CREATE_EXAMPLES: CreateExample[] = [
  {
    title: 'Nginx web server',
    image: 'nginx:latest',
    ports: '8080:80',
    volumes: './:/usr/share/nginx/html',
  },
  {
    title: 'PostgreSQL database',
    image: 'postgres:16',
    ports: '5432:5432',
    env: 'POSTGRES_PASSWORD=postgres\nPOSTGRES_DB=app',
  },
  { title: 'Redis cache', image: 'redis:7-alpine', ports: '6379:6379' },
  {
    title: 'MySQL database',
    image: 'mysql:8',
    ports: '3306:3306',
    env: 'MYSQL_ROOT_PASSWORD=root\nMYSQL_DATABASE=app',
  },
  {
    title: 'MongoDB',
    image: 'mongo:7',
    ports: '27017:27017',
    env: 'MONGO_INITDB_ROOT_USERNAME=admin\nMONGO_INITDB_ROOT_PASSWORD=admin',
  },
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
  {
    name: 'redis',
    tag: 'alpine',
    description: 'Redis is an open source key-value store.',
    color: '#dc382d',
  },
  {
    name: 'postgres',
    tag: '16',
    description: "The World's Most Advanced Open Source Relational Database",
    color: '#336791',
  },
  {
    name: 'node',
    tag: '20-alpine',
    description:
      'Node.js is a JavaScript-based platform for server-side and networking applications.',
    color: '#339933',
  },
  {
    name: 'python',
    tag: '3.12-slim',
    description:
      'Python is an interpreted, interactive, object-oriented, open-source programming language.',
    color: '#3776ab',
  },
  {
    name: 'mongo',
    tag: '7',
    description: 'MongoDB document databases provide high availability and easy scalability.',
    color: '#47A248',
  },
]

export function DockerPage(): ReactElement {
  const { t } = useTranslation('docker')
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabId) || 'scheme'
  const [tab, setTab] = useState<TabId>(initialTab)
  const [docker, setDocker] = useState<
    { ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null
  >(null)
  const [images, setImages] = useState<ImageRow[]>([])
  const [volumes, setVolumes] = useState<VolumeRow[]>([])
  const [networks, setNetworks] = useState<NetworkRow[]>([])
  const [err, setErr] = useState<string>('')
  const [pruneInfo, setPruneInfo] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<string>('')
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [exampleNetworks, setExampleNetworks] = useState<Record<string, string>>({})
  const [pullImage, setPullImage] = useState('')
  const [customImage, setCustomImage] = useState('nginx:latest')
  const [customName, setCustomName] = useState('')
  const [customPortsText, setCustomPortsText] = useState('8080:80')
  const [customVolumesText, setCustomVolumesText] = useState('')
  const [customEnvText, setCustomEnvText] = useState('')
  const [customNetworkMode, setCustomNetworkMode] = useState('bridge')
  const [autoStart, setAutoStart] = useState(true)
  const [createVolumeName, setCreateVolumeName] = useState('')
  const [createNetworkName, setCreateNetworkName] = useState('')
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [installDistro, setInstallDistro] = useState<InstallDistroId>('ubuntu')
  const [installStep, setInstallStep] = useState<number>(0)
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [installError, setInstallError] = useState<string | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [pruneSelection, setPruneSelection] = useState({
    containers: true,
    images: true,
    volumes: false,
    networks: false,
  })
  const [prunePreview, setPrunePreview] = useState<{
    containers: number
    images: number
    volumes: number
    networks: number
  } | null>(null)
  const [installedFeatures, setInstalledFeatures] = useState<{
    docker: boolean
    compose: boolean
    buildx: boolean
  }>({ docker: false, compose: false, buildx: false })
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    'docker',
    'compose',
    'buildx',
  ])
  const [hostDistroId, setHostDistroId] = useState<string>('linux')
  const [hubResults, setHubResults] = useState<
    Array<{ name: string; description: string; star_count: number; is_official: boolean }>
  >([])
  const [isSearchingHub, setIsSearchingHub] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState('latest')
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [activeTermContainer, setActiveTermContainer] = useState<ContainerRow | null>(null)
  const [inspectRow, setInspectRow] = useState<ContainerRow | null>(null)
  const [remapContainerId, setRemapContainerId] = useState('')
  const [remapOldPort, setRemapOldPort] = useState('')
  const [remapNewPort, setRemapNewPort] = useState('')
  const [remapContainerPort, setRemapContainerPort] = useState('')
  const [remapProtocol, setRemapProtocol] = useState<'tcp' | 'udp'>('tcp')
  const [remapNetworkMode, setRemapNetworkMode] = useState('bridge')
  const [remapBusy, setRemapBusy] = useState(false)
  const [remapFeedback, setRemapFeedback] = useState<string | null>(null)
  const [removeDialog, setRemoveDialog] = useState<{
    open: boolean
    id: string
    image: string
    removeVolumes: boolean
    removeImage: boolean
  }>({
    open: false,
    id: '',
    image: '',
    removeVolumes: false,
    removeImage: false,
  })
  const detectedInstallFamily: InstallDistroId | null = [
    'ubuntu',
    'debian',
    'linuxmint',
    'pop',
    'elementary',
    'raspbian',
  ].includes(hostDistroId)
    ? 'ubuntu'
    : ['fedora', 'rhel', 'centos', 'rocky', 'alma', 'amzn'].includes(hostDistroId)
      ? 'fedora'
      : ['arch', 'manjaro', 'endeavouros', 'garuda'].includes(hostDistroId)
        ? 'arch'
        : null

  const closeTerminal = useCallback(() => setActiveTermContainer(null), [])

  const refreshInstalledFeatures = useCallback(async () => {
    try {
      const res = await window.dh.dockerCheckInstalled()
      setInstalledFeatures(res)
    } catch {
      // keep previous UI state if refresh fails
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      setErr('')
      // 1. Get primary list (containers)
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

      // 2. Poll others in parallel, failing gracefully for sub-sections
      const [imgRes, volRes, netRes] = (await Promise.all([
        window.dh.dockerImagesList().catch((e) => ({ ok: false, error: String(e) })),
        window.dh.dockerVolumesList().catch((e) => ({ ok: false, error: String(e) })),
        window.dh.dockerNetworksList().catch((e) => ({ ok: false, error: String(e) })),
      ])) as [
        { ok: boolean; rows: ImageRow[]; error?: string },
        { ok: boolean; rows: VolumeRow[]; error?: string },
        { ok: boolean; rows: NetworkRow[]; error?: string },
      ]

      if (imgRes.ok) setImages(imgRes.rows)
      if (netRes.ok) setNetworks(netRes.rows)
      if (volRes.ok) {
        setVolumes(volRes.rows as VolumeRow[])
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setDocker({ ok: false, error: message })
      // Only setErr for the very first failure or persistent major failures
      // to avoid spamming the UI during polling if daemon goes away
      setErr((prev) => (prev === message ? prev : message))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshAll()
    const id = setInterval(() => void refreshAll(), 5000)
    return () => clearInterval(id)
  }, [refreshAll])

  useEffect(() => {
    void window.dh
      .getHostDistro()
      .then((raw) => {
        const distro = String(raw ?? 'linux').toLowerCase()
        setHostDistroId(distro)
        if (['ubuntu', 'debian', 'linuxmint', 'pop', 'elementary', 'raspbian'].includes(distro)) {
          setInstallDistro('ubuntu')
        } else if (['fedora', 'rhel', 'centos', 'rocky', 'alma', 'amzn'].includes(distro)) {
          setInstallDistro('fedora')
        } else if (['arch', 'manjaro', 'endeavouros', 'garuda'].includes(distro)) {
          setInstallDistro('arch')
        }
      })
      .catch(() => setHostDistroId('linux'))
    void refreshInstalledFeatures()
  }, [refreshInstalledFeatures])

  useEffect(() => {
    if (tab === 'cleanup') {
      void previewCleanup()
    }
  }, [tab])

  useEffect(() => {
    if (!pruneInfo) return
    const t = window.setTimeout(() => setPruneInfo(''), 6000)
    return () => window.clearTimeout(t)
  }, [pruneInfo])

  useEffect(() => {
    if (!createdInfo) return
    const t = window.setTimeout(() => setCreatedInfo(''), 6000)
    return () => window.clearTimeout(t)
  }, [createdInfo])

  useEffect(() => {
    if (tab !== 'ports' || !docker?.ok) return
    const list = docker.rows
    if (list.length === 0) {
      setRemapContainerId('')
      setRemapOldPort('')
      return
    }
    const remappable = list.filter((r) => extractFirstHostPort(r.ports) !== '')
    setRemapContainerId((current) => {
      if (current && list.some((r) => r.id === current)) return current
      return remappable[0]?.id ?? list[0].id
    })
  }, [tab, docker])

  useEffect(() => {
    if (!remapContainerId) return
    const selected = docker?.ok ? docker.rows.find((r) => r.id === remapContainerId) : undefined
    const firstNet = selected?.networks?.[0]
    if (firstNet) setRemapNetworkMode(firstNet)
    const hp = selected ? extractFirstHostPort(selected.ports) : ''
    setRemapOldPort(hp)
  }, [remapContainerId, docker])

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
        if (res.ok) setHubResults(res.results)
        else setHubResults([])
      } catch (e) {
        console.error('Search failed', e)
      } finally {
        setIsSearchingHub(false)
      }
    }, 400)
    return () => clearTimeout(id)
  }, [pullImage])

  async function runInstallation(): Promise<void> {
    setInstallBusy(true)
    setInstallError(null)
    setInstallLogs(['Starting installation...'])
    setInstallStep(3) // Move to progress step (mapped to step 3 now)

    try {
      const res = await window.dh.dockerInstall({
        distro: installDistro,
        components: selectedFeatures,
      })
      const logs = Array.isArray(res.log) ? res.log : []
      setInstallLogs(
        logs.length > 0 ? logs : res.ok ? ['Installation completed.'] : ['(no log output)']
      )
      if (res.ok) {
        setInstallStep(4) // Success (mapped to step 4 now)
        void refreshAll()
        void refreshInstalledFeatures()
      } else {
        setInstallError(humanizeDockerError(res.error || 'Unknown error during installation'))
      }
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstallBusy(false)
    }
  }

  async function runRemapPort(): Promise<void> {
    const list = docker?.ok ? docker.rows : []
    const remappable = list.filter((r) => extractFirstHostPort(r.ports) !== '')
    const selectedId = remapContainerId.trim() || remappable[0]?.id || list[0]?.id || ''
    const selected = list.find((r) => r.id === selectedId)
    const oldPortRaw = remapOldPort || (selected ? extractFirstHostPort(selected.ports) : '')
    const oldPort = parseInt(oldPortRaw, 10)
    const newPort = parseInt(remapNewPort, 10)
    const hasExistingBinding = Boolean(selected && extractFirstHostPort(selected.ports))

    if (!selected) {
      setRemapFeedback('Select a container first.')
      return
    }
    if (!newPort || newPort < 1 || newPort > 65535) {
      setRemapFeedback('Enter a valid new host port (1-65535).')
      return
    }
    if (!hasExistingBinding) {
      const cp = parseInt(remapContainerPort, 10)
      if (!cp || cp < 1 || cp > 65535) {
        setRemapFeedback('Enter the container port to bind (1-65535).')
        return
      }
    }

    setRemapBusy(true)
    setRemapFeedback(null)
    try {
      const res = (await window.dh.dockerRemapPort({
        id: selected.id,
        oldHostPort: hasExistingBinding ? oldPort : 0,
        newHostPort: newPort,
        containerPort: hasExistingBinding ? 0 : parseInt(remapContainerPort, 10),
        protocol: remapProtocol,
        networkMode: remapNetworkMode,
      })) as { ok: boolean; error?: string }
      if (!res.ok) {
        setRemapFeedback(res.error ?? 'Remap failed.')
      } else {
        setRemapFeedback('Done. Refreshing...')
        await refreshAll()
      }
    } catch (e) {
      setRemapFeedback(String(e))
    } finally {
      setRemapBusy(false)
    }
  }

  async function runAction(
    id: string,
    action: 'start' | 'stop' | 'restart' | 'remove'
  ): Promise<void> {
    if (action === 'remove') {
      const row = rows.find((r) => r.id === id)
      setRemoveDialog({
        open: true,
        id,
        image: row?.image ?? '',
        removeVolumes: false,
        removeImage: false,
      })
      return
    }
    setBusy(true)
    try {
      const res = await window.dh.dockerAction({ id, action })
      assertDockerOk(res, 'Container action failed.')
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemoveContainer(): Promise<void> {
    if (!removeDialog.id) return
    setBusy(true)
    try {
      const res = await window.dh.dockerAction({
        id: removeDialog.id,
        action: 'remove',
        removeVolumes: removeDialog.removeVolumes,
        removeImage: removeDialog.removeImage,
        image: removeDialog.image,
      })
      assertDockerOk(res, 'Container removal failed.')
      setRemoveDialog((s) => ({ ...s, open: false }))
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeImage(id: string): Promise<void> {
    setBusy(true)
    try {
      const removeRes = await window.dh.dockerImageAction({ id, action: 'remove' })
      assertDockerOk(removeRes, 'Image removal failed.')
      await refreshAll()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const canForce = /must be forced|being used by stopped container|conflict/i.test(message)
      if (canForce) {
        const deps = rows.filter((r) => r.imageId === id && r.state.toLowerCase() !== 'running')
        const depText =
          deps.length > 0
            ? `\nStopped containers using it: ${deps.map((d) => d.name).join(', ')}`
            : ''
        const yes = window.confirm(
          `This image is referenced by stopped containers.${depText}\n\nRemove dependent stopped containers first and retry image delete?`
        )
        if (yes) {
          try {
            for (const dep of deps) {
              const depRes = await window.dh.dockerAction({ id: dep.id, action: 'remove' })
              assertDockerOk(depRes, 'Failed removing dependent container.')
            }
            const forceRes = await window.dh.dockerImageAction({
              id,
              action: 'remove',
              force: true,
            })
            assertDockerOk(forceRes, 'Forced image removal failed.')
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
      const res = await window.dh.dockerVolumeAction({ name, action: 'remove' })
      assertDockerOk(res, 'Volume removal failed.')
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeNetwork(id: string): Promise<void> {
    const usage = networks.find((n) => n.id === id)?.usedBy ?? []
    if (usage.length > 0) {
      const yes = window.confirm(`This network is used by: ${usage.join(', ')}\nRemove anyway?`)
      if (!yes) return
    }
    setBusy(true)
    try {
      const res = await window.dh.dockerNetworkAction({ id, action: 'remove' })
      assertDockerOk(res, 'Network removal failed.')
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  async function runPrune(): Promise<void> {
    const yes = window.confirm(
      'Run Docker cleanup with the selected options? This may remove stopped resources.'
    )
    if (!yes) return
    setBusy(true)
    try {
      const res = (await window.dh.dockerCleanupRun(pruneSelection)) as {
        ok: boolean
        reclaimedBytes: number | string | null | undefined
        error?: string
      }
      assertDockerOk(res, 'Docker cleanup failed.')
      const reclaimedBytes =
        typeof res.reclaimedBytes === 'number'
          ? res.reclaimedBytes
          : Number.parseFloat(String(res.reclaimedBytes ?? '0'))
      const safeBytes = Number.isFinite(reclaimedBytes) && reclaimedBytes > 0 ? reclaimedBytes : 0
      const mb = Math.round((safeBytes / (1024 * 1024)) * 10) / 10
      setPruneInfo(`Cleanup finished. Reclaimed ~${mb} MB.`)
      await refreshAll()
      await previewCleanup()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  async function previewCleanup(): Promise<void> {
    try {
      const res = (await window.dh.dockerPrunePreview()) as {
        ok: boolean
        preview: { containers: number; images: number; volumes: number; networks: number }
        error?: string
      }
      assertDockerOk(res, 'Failed to preview cleanup.')
      setPrunePreview(res.preview)
    } catch (e) {
      setErr(humanizeDockerError(e))
    }
  }

  async function createCustomVolume(): Promise<void> {
    if (!createVolumeName.trim()) return
    setBusy(true)
    setErr('')
    setCreatedInfo('')
    try {
      const res = await window.dh.dockerVolumeCreate({ name: createVolumeName.trim() })
      assertDockerOk(res, 'Volume creation failed.')
      setCreatedInfo(`Created volume: ${createVolumeName.trim()}`)
      setCreateVolumeName('')
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
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
      const res = await window.dh.dockerNetworkCreate({ name: createNetworkName.trim() })
      assertDockerOk(res, 'Network creation failed.')
      setCreatedInfo(`Created network: ${createNetworkName.trim()}`)
      setCreateNetworkName('')
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
    }
  }

  function applyExampleToForm(example: CreateExample): void {
    const key = `${example.title}-${example.image}`
    const typedName = (customNames[key] ?? '').trim()
    const selectedNetwork = (exampleNetworks[key] ?? '').trim()
    setCustomImage(example.image)
    setCustomName(typedName)
    setCustomPortsText(example.ports ?? '')
    setCustomVolumesText(example.volumes ?? '')
    setCustomEnvText(example.env ?? '')
    setCustomNetworkMode(selectedNetwork || 'bridge')
    setCreatedInfo(`Filled form from example: ${example.title}`)
  }

  async function pullCustomImage(forceImage?: string): Promise<void> {
    const img = forceImage || pullImage.trim()
    if (!img) return
    setBusy(true)
    setErr('')
    setCreatedInfo(`Pulling image: ${img} (this may take a minute)...`)
    try {
      const res = await window.dh.dockerPull({ image: img })
      assertDockerOk(res, 'Image pull failed.')
      setCreatedInfo(`Pulled image: ${img}`)
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
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
        networkMode: customNetworkMode,
      })) as { ok: boolean; id?: string; error?: string }
      if (!res.ok || !res.id) {
        throw new Error(res.error || 'Container creation failed.')
      }
      setCreatedInfo(`Created container ${res.id.slice(0, 12)} from ${image}`)
      await refreshAll()
      setTab('containers')
    } catch (e) {
      setErr(humanizeDockerError(e))
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
  const remapTargetRow = rows.find((r) => r.id === remapContainerId)
  const remapTargetHasHostBinding = Boolean(
    remapTargetRow && extractFirstHostPort(remapTargetRow.ports)
  )

  return (
    <div className="docker-page elevated-page">
      <div className="docker-hero">
        <div className="docker-hero-eyebrow">{t('page.label')}</div>
        <h1 className="docker-hero-title">{t('page.title')}</h1>
        <p className="docker-hero-subtitle">{t('page.desc')}</p>
      </div>

      <div className="docker-toolbar">
        <button
          type="button"
          className="hp-btn"
          onClick={() => void refreshAll()}
          disabled={busy || refreshing}
        >
          {refreshing ? t('toolbar.refreshing') : t('toolbar.refresh')}
        </button>
        <button
          type="button"
          className="hp-btn"
          style={btnWarn}
          onClick={() => void runPrune()}
          disabled={busy}
        >
          {t('toolbar.pruneAll')}
        </button>
        <button
          type="button"
          className="hp-btn"
          onClick={() => {
            setInstallStep(0)
            setInstallError(null)
            setInstallLogs([])
            void refreshInstalledFeatures()
            setShowInstallModal(true)
          }}
        >
          {t('toolbar.installSetup')}
        </button>
        <span className="docker-toolbar-stats">
          {docker?.ok
            ? t('toolbar.stats', {
                containers: rows.length,
                images: images.length,
                volumes: volumes.length,
                networks: networks.length,
              })
            : t('toolbar.unavailable')}
        </span>
      </div>

      {pruneInfo ? (
        <div className="hp-status-alert success">
          <span style={{ fontSize: 18 }}>✔</span>
          <span>{pruneInfo}</span>
          <button
            type="button"
            className="hp-btn"
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setPruneInfo('')}
          >
            Close
          </button>
        </div>
      ) : null}
      {createdInfo ? (
        <div className="hp-status-alert success">
          <span style={{ fontSize: 18 }}>✔</span>
          <span>{createdInfo}</span>
          <button
            type="button"
            className="hp-btn"
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setCreatedInfo('')}
          >
            Close
          </button>
        </div>
      ) : null}
      {err ? (
        <div className="hp-status-alert warning">
          <span style={{ fontSize: 18 }}>⚠</span>
          <span>{err}</span>
          <button
            type="button"
            className="hp-btn"
            onClick={() => setErr('')}
            style={{ marginInlineStart: 'auto' }}
          >
            Close
          </button>
          <button
            type="button"
            className="hp-btn"
            onClick={() => void refreshAll()}
            style={{ marginLeft: 10 }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="docker-layout">
        {/* Sidebar nav */}
        <nav className="docker-sidebar">
          {(
            [
              { id: 'scheme', icon: '🗺', label: t('tab.scheme') },
              { id: 'create', icon: '➕', label: t('tab.create') },
              { id: 'containers', icon: '📦', label: t('tab.containers') },
              { id: 'images', icon: '🖼', label: t('tab.images') },
              { id: 'volumes', icon: '💾', label: t('tab.volumes') },
              { id: 'networks', icon: '🌐', label: t('tab.networks') },
              { id: 'ports', icon: '🔌', label: t('tab.ports') },
              { id: 'cleanup', icon: '🧹', label: t('tab.cleanup') },
            ] as { id: TabId; icon: string; label: string }[]
          ).map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`docker-tab-button ${tab === id ? 'active' : ''}`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Content pane */}
        <section className="docker-content">
          {!docker ? (
            <div style={{ color: 'var(--text-muted)' }}>{t('daemon.checking')}</div>
          ) : null}
          {docker && !docker.ok ? (
            <div style={{ color: 'var(--orange)' }}>{humanizeDockerError(docker.error)}</div>
          ) : null}
          {docker?.ok && tab === 'create' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {t('create.fromExamples', { use: t('action.use') })}
              </div>
              <div className="hp-card">
                <div className="hp-card-header">
                  <div className="hp-card-title">{t('create.hubExplorer')}</div>
                  <div className="hp-card-subtitle">{t('create.hubExplorerDesc')}</div>
                </div>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        value={pullImage}
                        onChange={(e) => {
                          setPullImage(e.target.value)
                          setAvailableTags([]) // Reset tags if typing manually
                        }}
                        placeholder={t('create.hubSearch')}
                        style={{ ...nameInput, marginTop: 0, width: '100%' }}
                        disabled={busy}
                      />
                      {isSearchingHub && (
                        <div
                          className="spinner"
                          style={{
                            position: 'absolute',
                            right: 12,
                            top: 11,
                            width: 16,
                            height: 16,
                            border: '2px solid var(--accent)',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                          }}
                        />
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
                        {availableTags.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      className="hp-btn hp-btn-primary"
                      onClick={() => {
                        const full = pullImage.includes(':')
                          ? pullImage
                          : `${pullImage}:${selectedTag}`
                        void pullCustomImage(full)
                      }}
                      disabled={busy || !pullImage || isLoadingTags}
                    >
                      {isLoadingTags ? t('create.pullingTags') : t('create.pullImage')}
                    </button>
                  </div>

                  {hubResults.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        marginTop: 4,
                        maxHeight: 300,
                        overflowY: 'auto',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      }}
                    >
                      {hubResults.map((r) => (
                        <div
                          key={r.name}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                          className="hub-result-item"
                          onClick={async () => {
                            setPullImage(r.name)
                            setHubResults([])
                            setIsLoadingTags(true)
                            try {
                              const res = await window.dh.dockerGetTags(r.name)
                              const tags = res.ok ? res.tags : []
                              setAvailableTags(tags)
                              if (tags.includes('latest')) setSelectedTag('latest')
                              else if (tags.length > 0) setSelectedTag(tags[0])
                            } finally {
                              setIsLoadingTags(false)
                            }
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 14,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              {r.name}
                              {r.is_official && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                  }}
                                >
                                  OFFICIAL
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {r.description}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--orange)',
                              whiteSpace: 'nowrap',
                              marginLeft: 12,
                            }}
                          >
                            ★ {r.star_count.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="hp-card">
                <div className="hp-card-header">
                  <div className="hp-card-title">{t('create.custom')}</div>
                  <div className="hp-card-subtitle">{t('create.customDesc')}</div>
                </div>
                <div style={formGrid}>
                  <input
                    value={customImage}
                    onChange={(e) => setCustomImage(e.target.value)}
                    placeholder={t('create.imagePlaceholder')}
                    className="hp-input"
                    disabled={busy}
                  />
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={t('create.namePlaceholder')}
                    className="hp-input"
                    disabled={busy}
                  />
                  <textarea
                    value={customPortsText}
                    onChange={(e) => setCustomPortsText(e.target.value)}
                    placeholder={t('create.portsPlaceholder')}
                    className="hp-input"
                    style={{ minHeight: 60 }}
                  />
                  <textarea
                    value={customVolumesText}
                    onChange={(e) => setCustomVolumesText(e.target.value)}
                    placeholder={t('create.volumesPlaceholder')}
                    className="hp-input"
                    style={{ minHeight: 60 }}
                  />
                  <textarea
                    value={customEnvText}
                    onChange={(e) => setCustomEnvText(e.target.value)}
                    placeholder={t('create.envPlaceholder')}
                    className="hp-input"
                    style={{ minHeight: 60 }}
                  />
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{t('create.networkMode')}</span>
                    <select
                      className="hp-input"
                      value={customNetworkMode}
                      onChange={(e) => setCustomNetworkMode(e.target.value)}
                    >
                      <option value="bridge">bridge</option>
                      <option value="host">host</option>
                      <option value="none">none</option>
                      {networks
                        .map((n) => n.name)
                        .filter(
                          (name, idx, arr) =>
                            !['bridge', 'host', 'none'].includes(name) && arr.indexOf(name) === idx
                        )
                        .map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={autoStart}
                      onChange={(e) => setAutoStart(e.target.checked)}
                    />
                    {t('create.autoStart')}
                  </label>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => void createCustomContainer()}
                    disabled={busy}
                  >
                    {t('create.createCustom')}
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
                      placeholder={t('create.namePlaceholder')}
                      className="hp-input"
                      disabled={busy}
                    />
                    <select
                      className="hp-input"
                      value={exampleNetworks[`${ex.title}-${ex.image}`] ?? 'bridge'}
                      onChange={(e) =>
                        setExampleNetworks((prev) => ({
                          ...prev,
                          [`${ex.title}-${ex.image}`]: e.target.value,
                        }))
                      }
                      disabled={busy}
                      style={{ marginTop: 8 }}
                    >
                      <option value="bridge">bridge</option>
                      <option value="host">host</option>
                      <option value="none">none</option>
                      {networks
                        .map((n) => n.name)
                        .filter(
                          (name, idx, arr) =>
                            !['bridge', 'host', 'none'].includes(name) && arr.indexOf(name) === idx
                        )
                        .map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => applyExampleToForm(ex)}
                    disabled={busy}
                  >
                    {t('action.use')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {docker?.ok && tab === 'containers' ? (
            rows.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>{t('container.none')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                <ContainerTable
                  title={t('container.running', { count: runningRows.length })}
                  rows={runningRows}
                  busy={busy}
                  onAction={runAction}
                  onConsole={(r) => setActiveTermContainer(r)}
                  onConfigure={(r) => setInspectRow(r)}
                />
                <ContainerTable
                  title={t('container.notRunning', { count: stoppedRows.length })}
                  rows={stoppedRows}
                  busy={busy}
                  onAction={runAction}
                  onConsole={(r) => setActiveTermContainer(r)}
                  onConfigure={(r) => setInspectRow(r)}
                />
                {stoppedRows.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {t('container.noStopped')}
                  </div>
                ) : null}
              </div>
            )
          ) : null}
          {docker?.ok && tab === 'images' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div className="hp-section-title">{t('image.recommended')}</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                    gap: 12,
                  }}
                >
                  {RECOMMENDED_IMAGES.map((rec) => (
                    <div
                      key={rec.name}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: rec.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: 16,
                          }}
                        >
                          {rec.name[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{rec.name}</div>
                          <div
                            className="mono"
                            style={{ fontSize: 11, color: 'var(--text-muted)' }}
                          >
                            {rec.tag}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                          flex: 1,
                        }}
                      >
                        {rec.description}
                      </div>
                      <button
                        type="button"
                        style={{ ...btnSmallPrimary, width: '100%', marginTop: 'auto' }}
                        onClick={() => {
                          const img = `${rec.name}:${rec.tag}`
                          setPullImage(img)
                          void pullCustomImage(img)
                        }}
                        disabled={busy}
                      >
                        {t('create.pullImage')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="hp-section-title">{t('image.downloaded')}</div>
                {images.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('image.none')}</div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {images.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          className="mono"
                          style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}
                          title={img.repoTags.join(', ')}
                        >
                          {img.repoTags.join(', ') || '<none>'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {img.sizeMb} MB • {img.createdAt}
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
                            {t('image.deploy')}
                          </button>
                          <button
                            type="button"
                            style={{ ...btnSmallDanger, flex: 1 }}
                            onClick={() => void removeImage(img.id)}
                            disabled={busy}
                          >
                            {t('action.remove')}
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
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('volume.create')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={createVolumeName}
                    onChange={(e) => setCreateVolumeName(e.target.value)}
                    placeholder={t('volume.namePlaceholder')}
                    style={{ ...nameInput, marginTop: 0, maxWidth: 320 }}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => void createCustomVolume()}
                    disabled={busy}
                  >
                    {t('volume.create')}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('volume.local')}</div>
                {volumes.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>{t('volume.none')}</div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {volumes.map((v) => (
                      <div
                        key={v.name}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          className="mono"
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            wordBreak: 'break-all',
                            color: 'var(--accent)',
                          }}
                          title={v.name}
                        >
                          {v.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            display: 'flex',
                            gap: 8,
                          }}
                        >
                          <span>
                            {t('volume.driver')}:{' '}
                            <span className="mono" data-ltr>
                              {v.driver}
                            </span>
                          </span>
                          <span>
                            {t('volume.scope')}:{' '}
                            <span className="mono" data-ltr>
                              {v.scope}
                            </span>
                          </span>
                        </div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            background: 'var(--bg)',
                            padding: '6px 8px',
                            borderRadius: 6,
                            wordBreak: 'break-all',
                          }}
                          title={v.mountpoint}
                        >
                          {truncateMiddle(v.mountpoint, 60)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {getVolumeDescription(v.name, !!(v.usedBy && v.usedBy.length > 0), t)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('volume.usedBy')}:{' '}
                          <span className="mono" style={{ fontSize: 11 }}>
                            {v.usedBy && v.usedBy.length > 0
                              ? v.usedBy.join(', ')
                              : t('volume.unused')}
                          </span>
                        </div>
                        <button
                          type="button"
                          style={{ ...btnSmallDanger, marginTop: 8 }}
                          onClick={() => void removeVolume(v.name)}
                          disabled={busy}
                        >
                          {t('volume.remove')}
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
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('scheme.relationship')}</div>
                {rows.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>{t('scheme.none')}</div>
                ) : (
                  <div style={tableWrap}>
                    <table style={table}>
                      <thead>
                        <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 6px' }}>{t('scheme.col.container')}</th>
                          <th>{t('scheme.col.image')}</th>
                          <th>{t('scheme.col.networks')}</th>
                          <th>{t('scheme.col.volumes')}</th>
                          <th>{t('scheme.col.ports')}</th>
                          <th>{t('scheme.col.state')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 6px', fontWeight: 600 }}>{r.name}</td>
                            <td className="mono" style={monoCell} title={r.image}>
                              {r.image}
                            </td>
                            <td
                              className="mono"
                              style={monoCell}
                              title={(r.networks ?? []).join(', ')}
                            >
                              {(r.networks ?? []).length > 0 ? (r.networks ?? []).join(', ') : '—'}
                            </td>
                            <td
                              className="mono"
                              style={monoCell}
                              title={(r.volumes ?? []).join(', ')}
                            >
                              {(r.volumes ?? []).length > 0 ? (r.volumes ?? []).join(', ') : '—'}
                            </td>
                            <td className="mono" style={monoCell} data-ltr title={r.ports}>
                              {r.ports}
                            </td>
                            <td>{t(`common:status.${r.state}`, { defaultValue: r.state })}</td>
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
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('network.create')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={createNetworkName}
                    onChange={(e) => setCreateNetworkName(e.target.value)}
                    placeholder={t('network.namePlaceholder')}
                    style={{ ...nameInput, marginTop: 0, maxWidth: 320 }}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => void createCustomNetwork()}
                    disabled={busy}
                  >
                    {t('network.create')}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('network.local')}</div>
                {networks.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>{t('network.none')}</div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {networks.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-all' }}>
                          {n.name}
                        </div>
                        <div
                          className="mono"
                          style={{ fontSize: 11, color: 'var(--text-muted)' }}
                          title={n.id}
                        >
                          {n.id.slice(0, 12)}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            display: 'flex',
                            gap: 8,
                            marginTop: 4,
                          }}
                        >
                          <span>
                            {t('network.driver')}:{' '}
                            <span className="mono" data-ltr>
                              {n.driver}
                            </span>
                          </span>
                          <span>
                            {t('network.scope')}:{' '}
                            <span className="mono" data-ltr>
                              {n.scope}
                            </span>
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {getNetworkDescription(n.name, t)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('network.usedBy')}:{' '}
                          <span className="mono" style={{ fontSize: 11 }}>
                            {n.usedBy && n.usedBy.length > 0
                              ? n.usedBy.join(', ')
                              : t('volume.unused')}
                          </span>
                        </div>
                        {n.name === 'bridge' || n.name === 'host' || n.name === 'none' ? (
                          <div style={{ ...systemBadge, marginTop: 8 }}>
                            {t('network.protected')}
                          </div>
                        ) : (
                          <button
                            type="button"
                            style={{ ...btnSmallDanger, marginTop: 8 }}
                            onClick={() => void removeNetwork(n.id)}
                            disabled={busy}
                          >
                            {t('network.remove')}
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
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('ports.listDesc')}</div>
              <div className="hp-card">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('ports.title')}</div>
                {rows.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>{t('ports.none')}</div>
                ) : (
                  <div style={tableWrap}>
                    <table style={table}>
                      <thead>
                        <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 6px' }}>{t('ports.col.container')}</th>
                          <th>{t('ports.col.state')}</th>
                          <th>{t('ports.col.ports')}</th>
                          <th>{t('ports.col.hostPublish')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 6px', fontWeight: 600 }} data-ltr>
                              {r.name}
                            </td>
                            <td>{t(`common:status.${r.state}`, { defaultValue: r.state })}</td>
                            <td className="mono" style={monoCell} data-ltr title={r.ports}>
                              {r.ports}
                            </td>
                            <td style={{ fontSize: 13 }}>
                              {extractFirstHostPort(r.ports) ? (
                                <span style={{ color: 'var(--green)' }}>yes</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>no</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="hp-card">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('ports.bindings')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('ports.remapDesc')}
                  </p>
                  {rows.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      No containers yet.
                    </div>
                  ) : null}
                  {rows.length > 0 ? (
                    <>
                      <label
                        style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
                      >
                        <span style={{ fontWeight: 600 }}>Container</span>
                        <select
                          className="hp-input"
                          value={remapContainerId}
                          onChange={(e) => {
                            const nextId = e.target.value
                            setRemapContainerId(nextId)
                            const next = rows.find((r) => r.id === nextId)
                            if (next) setRemapOldPort(extractFirstHostPort(next.ports))
                          }}
                          style={{
                            width: '100%',
                            background: '#1e1e1e',
                            color: '#e8e8e8',
                            border: '1px solid var(--border)',
                            height: 38,
                            appearance: 'none',
                            padding: '0 12px',
                          }}
                        >
                          {rows.map((r) => (
                            <option
                              key={r.id}
                              value={r.id}
                              style={{ background: '#1e1e1e', color: '#e8e8e8' }}
                            >
                              {r.name} ({r.id.slice(0, 12)}) — {r.ports}
                              {extractFirstHostPort(r.ports) ? '' : ' (no host publish in ps)'}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!remapTargetHasHostBinding ? (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 12,
                            alignItems: 'flex-end',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Container port</span>
                            <input
                              className="hp-input"
                              type="number"
                              min={1}
                              max={65535}
                              value={remapContainerPort}
                              onChange={(e) => setRemapContainerPort(e.target.value)}
                              placeholder="e.g. 80"
                              style={{ width: 100 }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Host port</span>
                            <input
                              className="hp-input"
                              type="number"
                              min={1}
                              max={65535}
                              value={remapNewPort}
                              onChange={(e) => setRemapNewPort(e.target.value)}
                              placeholder="e.g. 8080"
                              style={{ width: 100 }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Protocol</span>
                            <select
                              className="hp-input"
                              value={remapProtocol}
                              onChange={(e) => setRemapProtocol(e.target.value as 'tcp' | 'udp')}
                              style={{
                                width: 80,
                                background: '#1e1e1e',
                                color: '#e8e8e8',
                                border: '1px solid var(--border)',
                                height: 38,
                              }}
                            >
                              <option value="tcp">tcp</option>
                              <option value="udp">udp</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="hp-btn hp-btn-primary"
                            disabled={remapBusy}
                            onClick={() => void runRemapPort()}
                          >
                            {remapBusy ? 'Working…' : 'Add binding'}
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 12,
                            alignItems: 'flex-end',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Current host port</span>
                            <input
                              className="hp-input"
                              type="number"
                              min={1}
                              max={65535}
                              placeholder="8080"
                              value={remapOldPort}
                              onChange={(e) => setRemapOldPort(e.target.value)}
                              style={{ width: 120 }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {t('ports.newHostPort')}{' '}
                              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                                ({t('ports.sameKeepPort')})
                              </span>
                            </span>
                            <input
                              className="hp-input"
                              type="number"
                              min={1}
                              max={65535}
                              placeholder="same or new"
                              value={remapNewPort}
                              onChange={(e) => setRemapNewPort(e.target.value)}
                              style={{ width: 140 }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              fontSize: 13,
                              minWidth: 180,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Target network</span>
                            <select
                              className="hp-input"
                              value={remapNetworkMode}
                              onChange={(e) => setRemapNetworkMode(e.target.value)}
                            >
                              {networks.map((n) => (
                                <option key={n.name} value={n.name}>
                                  {n.name}
                                </option>
                              ))}
                              {networks.length === 0 ? (
                                <option value="bridge">bridge</option>
                              ) : null}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="hp-btn hp-btn-primary"
                            disabled={remapBusy}
                            onClick={() => void runRemapPort()}
                          >
                            {remapBusy ? t('ports.remapping') : t('ports.remap')}
                          </button>
                        </div>
                      )}
                      {remapFeedback ? (
                        <div
                          className={
                            remapFeedback.startsWith('Remap finished')
                              ? 'hp-status-alert success'
                              : 'hp-status-alert warning'
                          }
                          style={{ fontSize: 13 }}
                        >
                          {remapFeedback}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {tab === 'cleanup' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="hp-card">
                <h3 style={{ margin: 0, fontSize: 18 }}>{t('cleanup.title')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  {t('cleanup.freeUpDesc')}
                </p>
                <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  <label style={checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={pruneSelection.containers}
                      onChange={(e) =>
                        setPruneSelection((p) => ({ ...p, containers: e.target.checked }))
                      }
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t('cleanup.pruneContainers')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('cleanup.pruneContainersDesc')}
                      </div>
                    </div>
                  </label>
                  <label style={checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={pruneSelection.images}
                      onChange={(e) =>
                        setPruneSelection((p) => ({ ...p, images: e.target.checked }))
                      }
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t('cleanup.pruneImages')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('cleanup.pruneImagesDesc')}
                      </div>
                    </div>
                  </label>
                  <label style={checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={pruneSelection.volumes}
                      onChange={(e) =>
                        setPruneSelection((p) => ({ ...p, volumes: e.target.checked }))
                      }
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t('cleanup.pruneVolumes')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('cleanup.pruneVolumesDesc')}
                      </div>
                    </div>
                  </label>
                  <label style={checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={pruneSelection.networks}
                      onChange={(e) =>
                        setPruneSelection((p) => ({ ...p, networks: e.target.checked }))
                      }
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t('cleanup.pruneNetworks')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('cleanup.pruneNetworksDesc')}
                      </div>
                    </div>
                  </label>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('cleanup.dryRun')}</div>
                  {!prunePreview ? (
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => void previewCleanup()}
                      disabled={busy}
                    >
                      Load preview
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))',
                        gap: 8,
                      }}
                    >
                      <div style={previewCard}>
                        <div style={previewLabel}>{t('cleanup.col.containers')}</div>
                        <div style={previewValue} data-numeric>
                          {prunePreview.containers}
                        </div>
                      </div>
                      <div style={previewCard}>
                        <div style={previewLabel}>{t('cleanup.col.images')}</div>
                        <div style={previewValue} data-numeric>
                          {prunePreview.images}
                        </div>
                      </div>
                      <div style={previewCard}>
                        <div style={previewLabel}>{t('cleanup.col.volumes')}</div>
                        <div style={previewValue} data-numeric>
                          {prunePreview.volumes}
                        </div>
                      </div>
                      <div style={previewCard}>
                        <div style={previewLabel}>{t('cleanup.col.networks')}</div>
                        <div style={previewValue} data-numeric>
                          {prunePreview.networks}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  style={{ ...btnPrimary, marginTop: 20, width: '100%', padding: '12px' }}
                  onClick={() => void runPrune()}
                  disabled={busy || !Object.values(pruneSelection).some((v) => v)}
                >
                  {t('cleanup.runSelected')}
                </button>
              </div>

              <div style={{ ...sectionBox, border: '1px solid var(--orange)' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--orange)' }}>
                  {t('cleanup.safetyNote')}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {t('cleanup.safetyNoteDesc')}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {showInstallModal && (
        <div style={modalOverlay}>
          <div
            style={{
              ...modalContent,
              maxWidth: 600,
              minHeight: 450,
              background: 'var(--bg-panel)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    background: 'var(--accent)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                  }}
                >
                  D
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{t('wizard.title')}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Step {installStep + 1} of 5
                  </div>
                </div>
              </div>
              <button type="button" style={closeBtn} onClick={() => setShowInstallModal(false)}>
                ×
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {installStep === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <>
                    <div className="hp-status-alert success">
                      <span className="codicon codicon-pass" aria-hidden />
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {t('wizard.available')}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          This build can run your distro&apos;s package steps (with{' '}
                          <span className="mono">sudo</span>) for Docker Engine and selected
                          components. You can still follow the official guide instead if you prefer.
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Continue to choose components and enter your sudo password on the next steps.
                    </div>
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => void window.dh.openExternal(DOCKER_ENGINE_INSTALL_DOCS)}
                    >
                      <span className="codicon codicon-link-external" aria-hidden /> Official Docker
                      install guide (manual path)
                    </button>
                  </>
                </div>
              )}

              {installStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.distribution')}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                    Pick the package family for install commands (<span className="mono">apt</span>,{' '}
                    <span className="mono">dnf</span>, or <span className="mono">pacman</span>).
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Detected host distro: <span className="mono">{hostDistroId}</span>
                  </div>
                  {detectedInstallFamily ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Installer locked to: <span className="mono">{detectedInstallFamily}</span>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {(
                      [
                        { id: 'ubuntu' as const, label: t('wizard.distro.ubuntu') },
                        { id: 'fedora' as const, label: t('wizard.distro.fedora') },
                        { id: 'arch' as const, label: t('wizard.distro.arch') },
                      ] as { id: InstallDistroId; label: string }[]
                    ).map((d) => (
                      <label
                        key={d.id}
                        className="hp-card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          cursor: 'pointer',
                          border:
                            installDistro === d.id
                              ? '2px solid var(--accent)'
                              : '1px solid var(--border)',
                          background:
                            installDistro === d.id ? 'rgba(124, 77, 255, 0.08)' : 'var(--bg-input)',
                        }}
                      >
                        <input
                          type="radio"
                          name="install-distro"
                          checked={installDistro === d.id}
                          disabled={
                            Boolean(detectedInstallFamily) && d.id !== detectedInstallFamily
                          }
                          onChange={() => setInstallDistro(d.id)}
                        />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</span>
                      </label>
                    ))}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.components')}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                    We scanned your system and found some components are already installed.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { id: 'docker', title: 'Docker Engine', desc: 'Core daemon and CLI tools.' },
                      {
                        id: 'compose',
                        title: 'Docker Compose',
                        desc: 'Tool for defining and running multi-container apps.',
                      },
                      {
                        id: 'buildx',
                        title: 'Docker Buildx',
                        desc: 'Extended build capabilities with BuildKit.',
                      },
                    ].map((feat) => {
                      const isInstalled =
                        installedFeatures[feat.id as keyof typeof installedFeatures]
                      return (
                        <label
                          key={feat.id}
                          className="hp-card"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            opacity: isInstalled ? 0.6 : 1,
                            cursor: isInstalled ? 'default' : 'pointer',
                            background: selectedFeatures.includes(feat.id)
                              ? 'rgba(124, 77, 255, 0.05)'
                              : 'var(--bg-input)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFeatures.includes(feat.id) || isInstalled}
                            disabled={isInstalled}
                            onChange={() => {
                              if (selectedFeatures.includes(feat.id))
                                setSelectedFeatures((prev) => prev.filter((x) => x !== feat.id))
                              else setSelectedFeatures((prev) => [...prev, feat.id])
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600 }}>{feat.title}</span>
                              {isInstalled && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: 'var(--green)',
                                    background: 'rgba(76, 175, 80, 0.1)',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                  }}
                                >
                                  INSTALLED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {feat.desc}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {installStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.auth')}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                    Installation requires root privileges. You will be prompted by your system's
                    graphical security dialog (Polkit / pkexec) to authenticate securely.
                  </p>
                  <div
                    style={{
                      ...sectionBox,
                      background: 'rgba(255, 159, 67, 0.05)',
                      borderColor: 'rgba(255, 159, 67, 0.2)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--orange)' }}>
                      ⚠️ Ensure your user has sudo privileges on the host machine.
                    </div>
                  </div>
                </div>
              )}

              {installStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.installing')}</h3>
                    {installBusy && (
                      <div
                        className="spinner"
                        style={{
                          width: 20,
                          height: 20,
                          border: '2px solid var(--accent)',
                          borderTopColor: 'transparent',
                          borderRadius: '50%',
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: '#000',
                      borderRadius: 8,
                      padding: 12,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: '#0f0',
                      overflowY: 'auto',
                      maxHeight: 240,
                      minHeight: 200,
                    }}
                  >
                    {installLogs.map((log, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        {log}
                      </div>
                    ))}
                    {installError && (
                      <div style={{ color: 'var(--red)', marginTop: 8, fontWeight: 700 }}>
                        Error: {installError}
                      </div>
                    )}
                  </div>
                  {installError && (
                    <button className="hp-btn hp-btn-danger" onClick={() => setInstallStep(2)}>
                      {t('action.retryStep')}
                    </button>
                  )}
                </div>
              )}

              {installStep === 4 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    alignItems: 'center',
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      background: 'var(--green)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 32,
                      marginBottom: 12,
                    }}
                  >
                    ✔
                  </div>
                  <h2 style={{ margin: 0 }}>{t('wizard.complete')}</h2>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', maxWidth: 400 }}>
                    Docker Engine has been successfully installed and started. You can now manage
                    containers directly from this dashboard.
                  </p>
                  <div style={{ ...sectionBox, textAlign: 'left', width: '100%' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                      {t('wizard.nextSteps')}
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 20,
                        fontSize: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <li>{t('wizard.step.refreshDashboard')}</li>
                      <li>{t('wizard.step.verify')}</li>
                      <li>{t('wizard.step.permissions')}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 32,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                borderTop: '1px solid var(--border)',
                paddingTop: 20,
              }}
            >
              {installStep === 0 && (
                <>
                  <button className="hp-btn" onClick={() => setShowInstallModal(false)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => setInstallStep(1)}
                  >
                    Continue to wizard
                  </button>
                </>
              )}
              {installStep === 1 && (
                <>
                  <button className="hp-btn" onClick={() => setInstallStep(0)}>
                    {'<'}- Back
                  </button>
                  <button
                    className="hp-btn hp-btn-primary"
                    disabled={selectedFeatures.length === 0}
                    onClick={() => setInstallStep(2)}
                  >
                    Next {'>'}
                  </button>
                </>
              )}
              {installStep === 2 && (
                <>
                  <button className="hp-btn" onClick={() => setInstallStep(1)}>
                    {'<'}- Back
                  </button>
                  <button className="hp-btn hp-btn-primary" onClick={() => void runInstallation()}>
                    {t('action.installNow')}
                  </button>
                </>
              )}
              {installStep === 3 && !installBusy && (
                <button className="hp-btn" onClick={() => setInstallStep(0)}>
                  {t('action.abort')}
                </button>
              )}
              {installStep === 4 && (
                <button
                  className="hp-btn hp-btn-primary"
                  onClick={() => setShowInstallModal(false)}
                >
                  {t('action.finish')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTermContainer && (
        <DockerTerminalModal container={activeTermContainer} onClose={closeTerminal} />
      )}

      {removeDialog.open ? (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, maxWidth: 520 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>{t('container.remove.title')}</h3>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              Confirm removal options (like Windows dialog behavior).
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={removeDialog.removeVolumes}
                onChange={(e) =>
                  setRemoveDialog((s) => ({ ...s, removeVolumes: e.target.checked }))
                }
              />
              <span>{t('container.remove.withVolumes')}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={removeDialog.removeImage}
                onChange={(e) => setRemoveDialog((s) => ({ ...s, removeImage: e.target.checked }))}
              />
              <span>Also remove image ({removeDialog.image || 'unknown'})</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="hp-btn"
                onClick={() => setRemoveDialog((s) => ({ ...s, open: false }))}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hp-btn hp-btn-danger"
                onClick={() => void confirmRemoveContainer()}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inspectRow && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setInspectRow(null)}
          />
          <ContainerInspectDrawer
            row={inspectRow}
            networks={networks}
            onClose={() => setInspectRow(null)}
            onRefresh={refreshAll}
          />
        </>
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

function truncateMiddle(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input
  const side = Math.max(8, Math.floor((maxLen - 1) / 2))
  return `${input.slice(0, side)}…${input.slice(-side)}`
}

function parsePortMappings(
  text: string
): Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }> {
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

function getNetworkDescription(name: string, t: (key: string) => string): string {
  if (name === 'bridge') return t('network.descBridge')
  if (name === 'host') return t('network.descHost')
  if (name === 'none') return t('network.descNone')
  if (name.endsWith('_default')) return t('network.descCompose')
  return t('network.descCustom')
}

function getVolumeDescription(name: string, isUsed: boolean, t: (key: string) => string): string {
  if (name.length === 64 && !name.includes('_')) {
    return isUsed ? t('volume.descAnonymousUsed') : t('volume.descAnonymous')
  }
  return t('volume.descNamed')
}

function parseEnvLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function extractFirstHostPort(ports: string): string {
  const m = ports.match(/:(\d+)->/)
  return m?.[1] ?? ''
}

type ContainerTableProps = {
  title: string
  rows: ContainerRow[]
  busy: boolean
  onAction: (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<void>
  onConfigure: (row: ContainerRow) => void
}

function ContainerTable(
  props: ContainerTableProps & { onConsole: (row: ContainerRow) => void }
): ReactElement {
  const { title, rows, busy, onAction, onConsole, onConfigure } = props
  const { t } = useTranslation('docker')
  return (
    <div>
      <div className="hp-section-title">{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('container.noneInGroup')}</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: 16,
          }}
        >
          {rows.map((r) => {
            const isRunning = r.state.toLowerCase() === 'running'
            return (
              <div
                key={r.id}
                className="hp-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      flexShrink: 0,
                      marginTop: 4,
                      background: isRunning ? 'var(--green)' : 'var(--text-muted)',
                    }}
                    title={r.state}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={r.name}
                    >
                      {r.name}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={r.image}
                    >
                      {r.image}
                    </div>
                  </div>
                </div>

                {r.ports !== '—' && (
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      background: 'var(--bg)',
                      padding: '6px 8px',
                      borderRadius: 6,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 8px',
                    }}
                    title={r.ports}
                  >
                    {r.ports.split(',').map((p, idx) => {
                      const part = p.trim()
                      const hostPortMatch = part.match(/:(\d+)->/)
                      if (hostPortMatch && isRunning) {
                        const hp = hostPortMatch[1]
                        return (
                          <a
                            key={idx}
                            href={`http://localhost:${hp}`}
                            onClick={(e) => {
                              e.preventDefault()
                              void window.dh.openExternal(`http://localhost:${hp}`)
                            }}
                            style={{
                              color: 'var(--accent)',
                              textDecoration: 'none',
                              borderBottom: '1px dashed var(--accent)',
                            }}
                          >
                            {part}
                          </a>
                        )
                      }
                      return <span key={idx}>{part}</span>
                    })}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    gap: 8,
                    paddingTop: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => void onAction(r.id, isRunning ? 'stop' : 'start')}
                    disabled={busy}
                  >
                    {isRunning ? t('action.stop') : t('action.start')}
                  </button>
                  {isRunning && (
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => void onAction(r.id, 'restart')}
                      disabled={busy}
                    >
                      {t('action.restart')}
                    </button>
                  )}
                  {isRunning && (
                    <button
                      type="button"
                      className="hp-btn"
                      onClick={() => onConsole(r)}
                      disabled={busy}
                    >
                      {t('action.console')}
                    </button>
                  )}
                  {!isRunning ? (
                    <button
                      type="button"
                      className="hp-btn hp-btn-danger"
                      onClick={() => void onAction(r.id, 'remove')}
                      disabled={busy}
                    >
                      {t('action.remove')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => onConfigure(r)}
                    disabled={busy}
                  >
                    {t('action.configure')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type InspectDrawerProps = {
  row: ContainerRow
  networks: NetworkRow[]
  onClose: () => void
  onRefresh: () => Promise<void>
}

const DRAWER_TABS = ['info', 'ports', 'networks', 'env', 'volumes', 'logs', 'stats'] as const
type DrawerTab = (typeof DRAWER_TABS)[number]

function portsFromRowDisplay(
  ports: string
): Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }> {
  if (!ports || ports === '—') return []
  return ports
    .split(',')
    .map((p) => {
      const m = p.trim().match(/(?:[\d.]+:)?(\d+)->(\d+)\/(tcp|udp)/)
      if (!m) return null
      return { hostPort: m[1], containerPort: m[2], protocol: m[3] as 'tcp' | 'udp' }
    })
    .filter(Boolean) as Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }>
}

function hydrateDrawerFromInspect(data: ContainerInspectData): {
  editPorts: Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }>
  editEnv: string[]
  editNetwork: string
  editRestart: string
} {
  return {
    editPorts: data.ports.map((p) => ({
      hostPort: String(p.hostPort),
      containerPort: String(p.containerPort),
      protocol: (p.protocol === 'udp' ? 'udp' : 'tcp') as 'tcp' | 'udp',
    })),
    editEnv: [...data.env],
    editNetwork: data.networks[0] ?? 'bridge',
    editRestart: data.restartPolicy || 'no',
  }
}

function ContainerInspectDrawer({
  row,
  networks,
  onClose,
  onRefresh,
}: InspectDrawerProps): ReactElement {
  const { t } = useTranslation('docker')
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('info')
  const [logs, setLogs] = useState<string>('')
  const [logsBusy, setLogsBusy] = useState(false)
  const [inspectBusy, setInspectBusy] = useState(true)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyFeedback, setApplyFeedback] = useState('')
  const [editPorts, setEditPorts] = useState<
    Array<{ hostPort: string; containerPort: string; protocol: 'tcp' | 'udp' }>
  >(() => portsFromRowDisplay(row.ports))
  const [editEnv, setEditEnv] = useState<string[]>([])
  const [editNetwork, setEditNetwork] = useState(row.networks?.[0] ?? 'bridge')
  const [editRestart, setEditRestart] = useState('no')
  const [inspectVolumes, setInspectVolumes] = useState<string[]>(row.volumes ?? [])
  const [stats, setStats] = useState<{
    cpuPct: number
    memMb: number
    memLimitMb: number
    netRxMb: number
    netTxMb: number
  } | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)

  const isRunning = row.state.toLowerCase() === 'running'

  // Poll stats every 3s when stats tab is active and container is running
  useEffect(() => {
    if (drawerTab !== 'stats' || !isRunning) {
      setStats(null)
      setStatsError(null)
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const res = await window.dh.dockerContainerStats({ id: row.id })
        if (cancelled) return
        if (res.ok && res.cpuPct !== undefined) {
          setStats({
            cpuPct: res.cpuPct,
            memMb: res.memMb ?? 0,
            memLimitMb: res.memLimitMb ?? 0,
            netRxMb: res.netRxMb ?? 0,
            netTxMb: res.netTxMb ?? 0,
          })
          setStatsError(null)
        } else {
          setStatsError(t('stats.fetchError'))
        }
      } catch (e) {
        if (!cancelled) setStatsError(String(e))
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [drawerTab, row.id, isRunning, t])

  useEffect(() => {
    let cancelled = false
    setInspectBusy(true)
    setInspectError(null)
    void (async () => {
      try {
        const res = await window.dh.dockerInspect({ id: row.id })
        if (cancelled) return
        if (!res.ok || !res.data) {
          setInspectError(res.error ?? 'Could not load container inspect data.')
          return
        }
        const h = hydrateDrawerFromInspect(res.data)
        setEditPorts(h.editPorts)
        setEditEnv(h.editEnv)
        setEditNetwork(h.editNetwork)
        setEditRestart(h.editRestart)
        setInspectVolumes(res.data.volumes)
      } catch (e) {
        if (!cancelled) setInspectError(String(e))
      } finally {
        if (!cancelled) setInspectBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.id])

  const loadLogs = useCallback(async () => {
    setLogsBusy(true)
    try {
      const res = (await window.dh.dockerLogs({ id: row.id, tail: 200 })) as
        | string
        | { ok: boolean; text?: string; error?: string }
      if (typeof res === 'string') {
        setLogs(res || 'No logs')
        return
      }
      if (!res.ok) {
        setLogs(res.error || 'Error loading logs')
        return
      }
      setLogs(res.text || 'No logs')
    } finally {
      setLogsBusy(false)
    }
  }, [row.id])

  useEffect(() => {
    if (drawerTab === 'logs') void loadLogs()
  }, [drawerTab, row.id, loadLogs])

  async function applyChanges() {
    setApplying(true)
    setApplyFeedback('')
    try {
      const res = (await window.dh.dockerReconfigure({
        id: row.id,
        ports: editPorts
          .filter((p) => p.hostPort && p.containerPort)
          .map((p) => ({
            hostPort: Number(p.hostPort),
            containerPort: Number(p.containerPort),
            protocol: p.protocol,
          })),
        env: editEnv.filter((e) => e.trim()),
        networkMode: editNetwork,
        restartPolicy: editRestart,
      })) as { ok: boolean; error?: string }
      if (res.ok) {
        setApplyFeedback('Applied. Container restarted.')
        await onRefresh()
      } else {
        setApplyFeedback(res.error ?? 'Apply failed.')
      }
    } catch (e) {
      setApplyFeedback(String(e))
    } finally {
      setApplying(false)
    }
  }

  const volumeMounts = inspectVolumes.length > 0 ? inspectVolumes : (row.volumes ?? [])

  const sectionLabels: Record<DrawerTab, string> = {
    info: t('drawer.info'),
    ports: t('drawer.ports'),
    networks: t('drawer.networks'),
    env: t('drawer.env'),
    volumes: t('drawer.volumes'),
    logs: t('drawer.logs'),
    stats: t('drawer.stats'),
  }

  return (
    <div className="docker-inspect-drawer" role="dialog" aria-label={`Configure ${row.name}`}>
      <div className="docker-inspect-drawer__header">
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            flexShrink: 0,
            background: isRunning ? 'var(--green)' : 'var(--text-muted)',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {row.name}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {row.id.slice(0, 12)}
          </div>
        </div>
        <button
          type="button"
          className="hp-btn"
          onClick={onClose}
          style={{ padding: '4px 10px' }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="elevated-tabs-wrap docker-inspect-drawer__tabs" role="tablist">
        {DRAWER_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={drawerTab === t}
            className={`elevated-tab${drawerTab === t ? ' elevated-tab-active' : ''}`}
            onClick={() => setDrawerTab(t)}
          >
            {sectionLabels[t]}
          </button>
        ))}
      </div>

      <div className="docker-inspect-drawer__body">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {inspectBusy && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {t('inspect.loading')}
            </div>
          )}
          {inspectError && !inspectBusy && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
              {inspectError}
            </div>
          )}

          {drawerTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('inspect.image')}
                </span>
                <div className="mono" data-ltr style={{ marginTop: 4 }}>
                  {row.image}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('inspect.state')}
                </span>
                <div style={{ marginTop: 4 }}>
                  {t(`common:status.${row.state}`, { defaultValue: row.state })} —{' '}
                  <span data-ltr>{row.status}</span>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('inspect.id')}</span>
                <div className="mono" data-ltr style={{ marginTop: 4, fontSize: 12 }}>
                  {row.id}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {t('inspect.restartPolicy')}
                </span>
                <select
                  className="hp-input"
                  value={editRestart}
                  onChange={(e) => setEditRestart(e.target.value)}
                  style={{
                    marginTop: 4,
                    display: 'block',
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#e8e8e8',
                    border: '1px solid var(--border)',
                    height: 36,
                  }}
                >
                  <option value="no">no (default)</option>
                  <option value="always">always</option>
                  <option value="unless-stopped">unless-stopped</option>
                  <option value="on-failure">on-failure</option>
                </select>
              </div>
              <button
                type="button"
                className="hp-btn"
                onClick={() => void applyChanges()}
                disabled={applying}
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              >
                {applying ? 'Applying…' : 'Apply restart policy'}
              </button>
              {applyFeedback && (
                <div
                  style={{
                    fontSize: 12,
                    color: applyFeedback.startsWith('Applied') ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {applyFeedback}
                </div>
              )}
            </div>
          )}

          {drawerTab === 'ports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('inspect.portBindings')}
              </div>
              {editPorts.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="hp-input"
                    type="number"
                    min={1}
                    max={65535}
                    value={p.hostPort}
                    onChange={(e) =>
                      setEditPorts((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, hostPort: e.target.value } : x))
                      )
                    }
                    placeholder="Host"
                    style={{ width: 80 }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <input
                    className="hp-input"
                    type="number"
                    min={1}
                    max={65535}
                    value={p.containerPort}
                    onChange={(e) =>
                      setEditPorts((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, containerPort: e.target.value } : x))
                      )
                    }
                    placeholder="Container"
                    style={{ width: 90 }}
                  />
                  <select
                    className="hp-input"
                    value={p.protocol}
                    onChange={(e) =>
                      setEditPorts((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, protocol: e.target.value as 'tcp' | 'udp' } : x
                        )
                      )
                    }
                    style={{
                      width: 70,
                      background: '#1e1e1e',
                      color: '#e8e8e8',
                      border: '1px solid var(--border)',
                      height: 36,
                    }}
                  >
                    <option value="tcp">tcp</option>
                    <option value="udp">udp</option>
                  </select>
                  <button
                    type="button"
                    className="hp-btn hp-btn-danger"
                    onClick={() => setEditPorts((prev) => prev.filter((_, j) => j !== i))}
                    style={{ padding: '4px 10px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="hp-btn"
                onClick={() =>
                  setEditPorts((prev) => [
                    ...prev,
                    { hostPort: '', containerPort: '', protocol: 'tcp' },
                  ])
                }
                style={{ alignSelf: 'flex-start' }}
              >
                + Add binding
              </button>
              <button
                type="button"
                className="hp-btn"
                onClick={() => void applyChanges()}
                disabled={applying}
                style={{ alignSelf: 'flex-start' }}
              >
                {applying ? 'Applying…' : 'Apply port changes'}
              </button>
              {applyFeedback && (
                <div
                  style={{
                    fontSize: 12,
                    color: applyFeedback.startsWith('Applied') ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {applyFeedback}
                </div>
              )}
            </div>
          )}

          {drawerTab === 'networks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('inspect.networkMode')}
              </div>
              <select
                className="hp-input"
                value={editNetwork}
                onChange={(e) => setEditNetwork(e.target.value)}
                style={{
                  background: '#1e1e1e',
                  color: '#e8e8e8',
                  border: '1px solid var(--border)',
                  height: 36,
                  width: '100%',
                }}
              >
                <option value="bridge">bridge</option>
                <option value="host">host</option>
                <option value="none">none</option>
                {networks
                  .filter((n) => !['bridge', 'host', 'none'].includes(n.name))
                  .map((n) => (
                    <option key={n.id} value={n.name}>
                      {n.name}
                    </option>
                  ))}
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Currently: {row.networks?.join(', ') || 'unknown'}
              </div>
              <button
                type="button"
                className="hp-btn"
                onClick={() => void applyChanges()}
                disabled={applying}
                style={{ alignSelf: 'flex-start' }}
              >
                {applying ? 'Applying…' : 'Apply network change'}
              </button>
              {applyFeedback && (
                <div
                  style={{
                    fontSize: 12,
                    color: applyFeedback.startsWith('Applied') ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {applyFeedback}
                </div>
              )}
            </div>
          )}

          {drawerTab === 'env' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('inspect.envVars')}</div>
              {editEnv.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="hp-input"
                    value={e}
                    onChange={(ev) =>
                      setEditEnv((prev) => prev.map((x, j) => (j === i ? ev.target.value : x)))
                    }
                    placeholder="KEY=VALUE"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="hp-btn hp-btn-danger"
                    onClick={() => setEditEnv((prev) => prev.filter((_, j) => j !== i))}
                    style={{ padding: '4px 10px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="hp-btn"
                onClick={() => setEditEnv((prev) => [...prev, ''])}
                style={{ alignSelf: 'flex-start' }}
              >
                + Add env var
              </button>
              <button
                type="button"
                className="hp-btn"
                onClick={() => void applyChanges()}
                disabled={applying}
                style={{ alignSelf: 'flex-start' }}
              >
                {applying ? 'Applying…' : 'Apply env changes'}
              </button>
              {applyFeedback && (
                <div
                  style={{
                    fontSize: 12,
                    color: applyFeedback.startsWith('Applied') ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {applyFeedback}
                </div>
              )}
            </div>
          )}

          {drawerTab === 'volumes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('inspect.volumeMounts')}
              </div>
              {volumeMounts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>{t('inspect.noVolumes')}</div>
              ) : (
                volumeMounts.map((v, i) => (
                  <div
                    key={i}
                    className="mono"
                    style={{
                      fontSize: 12,
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '6px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {v}
                  </div>
                ))
              )}
            </div>
          )}

          {drawerTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
              <button
                type="button"
                className="hp-btn"
                onClick={() => void loadLogs()}
                disabled={logsBusy}
                style={{ alignSelf: 'flex-start' }}
              >
                {logsBusy ? 'Loading…' : '↻ Refresh'}
              </button>
              <pre
                style={{
                  fontSize: 11,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  color: 'var(--text)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: 12,
                  borderRadius: 6,
                  minHeight: '300px',
                  flex: 1,
                  overflow: 'auto',
                }}
              >
                {logs || (logsBusy ? 'Loading…' : 'No logs.')}
              </pre>
            </div>
          )}

          {drawerTab === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!isRunning ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('stats.empty')}</div>
              ) : statsError ? (
                <div style={{ fontSize: 13, color: 'var(--red)' }}>{statsError}</div>
              ) : (
                <>
                  {/* CPU Bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{t('stats.cpu')}</span>
                      <span className="mono">{(stats?.cpuPct ?? 0).toFixed(1)}%</span>
                    </div>
                    <div
                      style={{
                        background: 'var(--bg)',
                        borderRadius: 4,
                        height: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          background: 'var(--accent)',
                          height: '100%',
                          borderRadius: 4,
                          width: `${Math.min(stats?.cpuPct ?? 0, 100)}%`,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Memory Bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{t('stats.memory')}</span>
                      <span className="mono">
                        {(stats?.memMb ?? 0).toFixed(0)} MB
                        {(stats?.memLimitMb ?? 0) > 0
                          ? ` / ${(stats?.memLimitMb ?? 0).toFixed(0)} MB`
                          : ''}
                      </span>
                    </div>
                    <div
                      style={{
                        background: 'var(--bg)',
                        borderRadius: 4,
                        height: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          background: 'var(--green)',
                          height: '100%',
                          borderRadius: 4,
                          width: `${(stats?.memLimitMb ?? 0) > 0 ? Math.min(((stats?.memMb ?? 0) / (stats?.memLimitMb ?? 1)) * 100, 100) : 0}%`,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Network I/O */}
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {t('stats.netRx')}
                      </div>
                      <div className="mono" style={{ fontSize: 13 }}>
                        {(stats?.netRxMb ?? 0).toFixed(2)} MB
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {t('stats.netTx')}
                      </div>
                      <div className="mono" style={{ fontSize: 13 }}>
                        {(stats?.netTxMb ?? 0).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('stats.polling')}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DockerTerminalModal({
  container,
  onClose,
}: {
  container: ContainerRow
  onClose: () => void
}): ReactElement {
  const termWrapRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const termIdRef = useRef<string | undefined>(undefined)
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!termWrapRef.current) return
    const el = termWrapRef.current
    let cancelled = false

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      convertEol: true,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#7c4dff',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    term.focus()
    xtermRef.current = term

    void (async () => {
      let res: { ok: boolean; id?: string; error?: string }
      try {
        res = await window.dh.dockerTerminal({
          containerId: container.id,
          cols: term.cols,
          rows: term.rows,
        })
      } catch (e) {
        if (cancelled) return
        term.writeln(`\r\nError creating terminal: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      if (cancelled) {
        if (res.ok && res.id) window.dh.terminalClose(res.id)
        return
      }
      if (!res.ok || !res.id) {
        term.writeln(`\r\nError creating terminal: ${res.ok ? 'missing id' : res.error}`)
        return
      }
      const tid = res.id
      termIdRef.current = tid

      const onData = (d: string): void => {
        const id = termIdRef.current
        if (id) {
          window.dh.terminalWrite(id, d)
        }
      }
      term.onData(onData)

      const offOut = window.dh.onTerminalData(({ id, data }) => {
        if (id === tid) term.write(data)
      })
      const offExit = window.dh.onTerminalExit(({ id }) => {
        if (id === tid) {
          term.writeln('\r\n[process exited — terminal remains open]')
          termIdRef.current = undefined
        }
      })
      unlistenRef.current = () => {
        offOut()
        offExit()
      }

      term.onResize(({ cols, rows }) => {
        window.dh.terminalResize(tid, cols, rows)
      })
    })()

    const handleResize = () => fit.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      unlistenRef.current?.()
      unlistenRef.current = null
      const id = termIdRef.current
      if (id) window.dh.terminalClose(id)
      termIdRef.current = undefined
      term.dispose()
    }
  }, [container.id, onClose])

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalContent, width: '90%', height: '80%', maxWidth: 1000 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>Terminal: {container.name}</div>
          <button onClick={onClose} style={closeBtn}>
            &times;
          </button>
        </div>
        <div
          ref={termWrapRef}
          onClick={() => {
            const ta = termWrapRef.current?.querySelector(
              '.xterm-helper-textarea'
            ) as HTMLTextAreaElement | null
            ta?.focus()
          }}
          style={{
            flex: 1,
            background: '#0a0a0a',
            borderRadius: 8,
            padding: '16px',
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  )
}
