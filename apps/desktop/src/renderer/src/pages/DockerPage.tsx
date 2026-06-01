import type { ContainerRow, ImageRow, NetworkRow, VolumeRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { assertDockerOk } from './dockerContract'
import { humanizeDockerError } from './dockerError'
import { ContainerTable } from './docker/ContainerTable'
import { ContainerInspectDrawer } from './docker/ContainerInspectDrawer'
import { DockerCreateTab } from './docker/DockerCreateTab'
import { DockerImagesTab } from './docker/DockerImagesTab'
import { DockerVolumesTab } from './docker/DockerVolumesTab'
import { DockerNetworksTab } from './docker/DockerNetworksTab'
import { DockerSchemeTab } from './docker/DockerSchemeTab'
import { DockerPortsTab } from './docker/DockerPortsTab'
import { DockerCleanupTab } from './docker/DockerCleanupTab'
import DockerInstallModal, { type InstallDistroId } from './docker/DockerInstallModal'
import { DockerTerminalModal } from './docker/DockerTerminalModal'
import {
  parsePortMappings,
  parseVolumeMappings,
  parseEnvLines,
  extractFirstHostPort,
} from './docker/dockerHelpers'
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
  const [actionInfo, setActionInfo] = useState<string>('')
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
  const [actionConfirm, setActionConfirm] = useState<{
    open: boolean
    id: string
    name: string
    action: 'stop' | 'restart'
  }>({
    open: false,
    id: '',
    name: '',
    action: 'stop',
  })
  const [flashCreateBtn, setFlashCreateBtn] = useState(false)
  const customFormRef = useRef<HTMLDivElement>(null)
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
      // 1. Get primary list (containers)
      const d = (await window.dh.dockerList()) as
        | { ok: true; rows: ContainerRow[] }
        | { ok: false; error: string }
      if (!d.ok) {
        const message = humanizeDockerError(d.error ?? 'Docker unavailable.')
        setDocker({ ok: false, error: message })
        setErr(message)
        setImages([])
        setVolumes([])
        setNetworks([])
        return
      }

      setErr('')
      setDocker(d)

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
      const message = humanizeDockerError(e)
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
    if (!actionInfo) return
    const t = window.setTimeout(() => setActionInfo(''), 6000)
    return () => window.clearTimeout(t)
  }, [actionInfo])

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
      setInstallError(humanizeDockerError(e))
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
        setRemapFeedback(humanizeDockerError(res.error ?? 'Remap failed.'))
      } else {
        setRemapFeedback('Done. Refreshing...')
        await refreshAll()
      }
    } catch (e) {
      setRemapFeedback(humanizeDockerError(e))
    } finally {
      setRemapBusy(false)
    }
  }

  async function executeContainerAction(
    id: string,
    action: 'start' | 'stop' | 'restart',
    containerName: string
  ): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      const res = await window.dh.dockerAction({ id, action })
      assertDockerOk(res, 'Container action failed.')
      const message =
        action === 'start'
          ? t('action.started', { name: containerName })
          : action === 'stop'
            ? t('action.stopped', { name: containerName })
            : t('action.restarted', { name: containerName })
      setActionInfo(message)
      await refreshAll()
    } catch (e) {
      setErr(humanizeDockerError(e))
    } finally {
      setBusy(false)
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
    const row = rows.find((r) => r.id === id)
    const name = row?.name ?? id.slice(0, 12)
    if (action === 'stop' || action === 'restart') {
      setActionConfirm({ open: true, id, name, action })
      return
    }
    await executeContainerAction(id, action, name)
  }

  async function confirmContainerAction(): Promise<void> {
    if (!actionConfirm.open) return
    const { id, name, action } = actionConfirm
    setActionConfirm((s) => ({ ...s, open: false }))
    await executeContainerAction(id, action, name)
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
            setErr(humanizeDockerError(forceErr))
          }
        } else {
          setErr('Image removal cancelled.')
        }
      } else {
        setErr(humanizeDockerError(e))
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

    // Scroll the custom form into view so the user sees the populated fields
    customFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Flash the Create button to draw attention to the next step
    setFlashCreateBtn(true)
    setTimeout(() => setFlashCreateBtn(false), 1500)
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
      setCreatedInfo('')
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
      {actionInfo ? (
        <div className="hp-status-alert success">
          <span style={{ fontSize: 18 }}>✔</span>
          <span>{actionInfo}</span>
          <button
            type="button"
            className="hp-btn"
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setActionInfo('')}
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
              { id: 'scheme', icon: '🗺', label: t('tab.scheme'), tip: t('tab.scheme.tip') },
              { id: 'create', icon: '➕', label: t('tab.create'), tip: t('tab.create.tip') },
              {
                id: 'containers',
                icon: '📦',
                label: t('tab.containers'),
                tip: t('tab.containers.tip'),
              },
              { id: 'images', icon: '🖼', label: t('tab.images'), tip: t('tab.images.tip') },
              { id: 'volumes', icon: '💾', label: t('tab.volumes'), tip: t('tab.volumes.tip') },
              { id: 'networks', icon: '🌐', label: t('tab.networks'), tip: t('tab.networks.tip') },
              { id: 'ports', icon: '🔌', label: t('tab.ports'), tip: t('tab.ports.tip') },
              { id: 'cleanup', icon: '🧹', label: t('tab.cleanup'), tip: t('tab.cleanup.tip') },
            ] as { id: TabId; icon: string; label: string; tip: string }[]
          ).map(({ id, icon, label, tip }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`docker-tab-button ${tab === id ? 'active' : ''}`}
              title={tip}
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
            <DockerCreateTab
              t={t}
              busy={busy}
              pullImage={pullImage}
              setPullImage={setPullImage}
              customImage={customImage}
              setCustomImage={setCustomImage}
              customName={customName}
              setCustomName={setCustomName}
              customPortsText={customPortsText}
              setCustomPortsText={setCustomPortsText}
              customVolumesText={customVolumesText}
              setCustomVolumesText={setCustomVolumesText}
              customEnvText={customEnvText}
              setCustomEnvText={setCustomEnvText}
              customNetworkMode={customNetworkMode}
              setCustomNetworkMode={setCustomNetworkMode}
              autoStart={autoStart}
              setAutoStart={setAutoStart}
              networks={networks}
              isSearchingHub={isSearchingHub}
              hubResults={hubResults}
              setHubResults={setHubResults}
              availableTags={availableTags}
              setAvailableTags={setAvailableTags}
              selectedTag={selectedTag}
              setSelectedTag={setSelectedTag}
              isLoadingTags={isLoadingTags}
              setIsLoadingTags={setIsLoadingTags}
              customNames={customNames}
              setCustomNames={setCustomNames}
              exampleNetworks={exampleNetworks}
              setExampleNetworks={setExampleNetworks}
              flashCreateBtn={flashCreateBtn}
              customFormRef={customFormRef}
              onPullImage={(full) => {
                setPullImage(full)
                void pullCustomImage(full)
              }}
              onCreateContainer={() => void createCustomContainer()}
              onApplyExample={applyExampleToForm}
              onGetTags={async (name) => {
                const res = await window.dh.dockerGetTags(name)
                return res.ok ? res.tags : []
              }}
            />
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
            <DockerImagesTab
              t={t}
              busy={busy}
              images={images}
              onDeployImage={(img) => {
                setCustomImage(img.repoTags[0] || img.id.slice(0, 12))
                setTab('create')
              }}
              onPullImage={(full) => {
                setPullImage(full)
                void pullCustomImage(full)
              }}
              onRemoveImage={(id) => void removeImage(id)}
            />
          ) : null}

          {docker?.ok && tab === 'volumes' ? (
            <DockerVolumesTab
              t={t}
              busy={busy}
              volumes={volumes}
              createVolumeName={createVolumeName}
              setCreateVolumeName={setCreateVolumeName}
              onCreateVolume={() => createCustomVolume()}
              onRemoveVolume={(name) => removeVolume(name)}
            />
          ) : null}
          {docker?.ok && tab === 'scheme' ? (
            <DockerSchemeTab t={t} rows={rows} networks={networks} />
          ) : null}
          {docker?.ok && tab === 'networks' ? (
            <DockerNetworksTab
              t={t}
              busy={busy}
              networks={networks}
              createNetworkName={createNetworkName}
              setCreateNetworkName={setCreateNetworkName}
              onCreateNetwork={() => createCustomNetwork()}
              onRemoveNetwork={(id) => removeNetwork(id)}
            />
          ) : null}
          {docker?.ok && tab === 'ports' ? (
            <DockerPortsTab
              t={t}
              rows={rows}
              networks={networks}
              remapContainerId={remapContainerId}
              setRemapContainerId={setRemapContainerId}
              remapOldPort={remapOldPort}
              setRemapOldPort={setRemapOldPort}
              remapNewPort={remapNewPort}
              setRemapNewPort={setRemapNewPort}
              remapContainerPort={remapContainerPort}
              setRemapContainerPort={setRemapContainerPort}
              remapProtocol={remapProtocol}
              setRemapProtocol={setRemapProtocol}
              remapNetworkMode={remapNetworkMode}
              setRemapNetworkMode={setRemapNetworkMode}
              remapBusy={remapBusy}
              remapFeedback={remapFeedback}
              onRemapPort={() => void runRemapPort()}
            />
          ) : null}
          {tab === 'cleanup' ? (
            <DockerCleanupTab
              t={t}
              busy={busy}
              pruneSelection={pruneSelection}
              setPruneSelection={setPruneSelection}
              prunePreview={prunePreview}
              onPreviewCleanup={() => void previewCleanup()}
              onRunPrune={() => void runPrune()}
            />
          ) : null}
        </section>
      </div>

      <DockerInstallModal
        t={t}
        showInstallModal={showInstallModal}
        hostDistroId={hostDistroId}
        installDistro={installDistro}
        setInstallDistro={setInstallDistro}
        detectedInstallFamily={detectedInstallFamily}
        installStep={installStep}
        setInstallStep={setInstallStep}
        installLogs={installLogs}
        installError={installError}
        installBusy={installBusy}
        installedFeatures={installedFeatures}
        selectedFeatures={selectedFeatures}
        setSelectedFeatures={setSelectedFeatures}
        onClose={() => setShowInstallModal(false)}
        onRunInstallation={runInstallation}
      />

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

      {actionConfirm.open ? (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, maxWidth: 480 }}>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>
              {actionConfirm.action === 'stop'
                ? t('action.confirmStop.title')
                : t('action.confirmRestart.title')}
            </h3>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              {actionConfirm.action === 'stop'
                ? t('action.confirmStop.body', { name: actionConfirm.name })
                : t('action.confirmRestart.body', { name: actionConfirm.name })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="hp-btn"
                onClick={() => setActionConfirm((s) => ({ ...s, open: false }))}
              >
                {t('action.cancel')}
              </button>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                onClick={() => void confirmContainerAction()}
                disabled={busy}
              >
                {actionConfirm.action === 'stop' ? t('action.stop') : t('action.restart')}
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

      {/* Engine status bar */}
      <div className="docker-engine-status">
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            marginRight: 8,
            background: docker?.ok
              ? 'var(--green)'
              : docker
                ? 'var(--orange)'
                : 'var(--text-muted)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {docker?.ok
            ? 'LuminaDev Engine: Connected'
            : docker
              ? 'LuminaDev Engine: Disconnected'
              : 'LuminaDev Engine: Checking…'}
        </span>
      </div>
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
