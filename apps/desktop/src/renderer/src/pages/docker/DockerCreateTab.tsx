import type { ReactElement, RefObject } from 'react'
import type { NetworkRow } from '@linux-dev-home/shared'

interface DockerCreateTabProps {
  t: (key: string, options?: Record<string, string>) => string
  busy: boolean
  pullImage: string
  setPullImage: (v: string) => void
  customImage: string
  setCustomImage: (v: string) => void
  customName: string
  setCustomName: (v: string) => void
  customPortsText: string
  setCustomPortsText: (v: string) => void
  customVolumesText: string
  setCustomVolumesText: (v: string) => void
  customEnvText: string
  setCustomEnvText: (v: string) => void
  customNetworkMode: string
  setCustomNetworkMode: (v: string) => void
  autoStart: boolean
  setAutoStart: (v: boolean) => void
  networks: NetworkRow[]
  isSearchingHub: boolean
  hubResults: Array<{
    name: string
    description: string
    star_count: number
    is_official: boolean
  }>
  setHubResults: (
    v: Array<{
      name: string
      description: string
      star_count: number
      is_official: boolean
    }>
  ) => void
  availableTags: string[]
  setAvailableTags: (v: string[]) => void
  selectedTag: string
  setSelectedTag: (v: string) => void
  isLoadingTags: boolean
  setIsLoadingTags: (v: boolean) => void
  customNames: Record<string, string>
  setCustomNames: React.Dispatch<React.SetStateAction<Record<string, string>>>
  exampleNetworks: Record<string, string>
  setExampleNetworks: React.Dispatch<React.SetStateAction<Record<string, string>>>
  flashCreateBtn: boolean
  customFormRef: RefObject<HTMLDivElement | null>
  onPullImage: (fullImage: string) => void
  onCreateContainer: () => void
  onApplyExample: (example: CreateExample) => void
  onGetTags: (imageName: string) => Promise<string[]>
}

type CreateExample = {
  title: string
  image: string
  command?: string
  ports?: string
  volumes?: string
  env?: string
}

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

const monoCell = {
  fontSize: 11,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const formGrid = {
  display: 'grid',
  gap: 8,
}

export function DockerCreateTab(props: DockerCreateTabProps): ReactElement {
  const {
    t,
    busy,
    pullImage,
    setPullImage,
    customImage,
    setCustomImage,
    customName,
    setCustomName,
    customPortsText,
    setCustomPortsText,
    customVolumesText,
    setCustomVolumesText,
    customEnvText,
    setCustomEnvText,
    customNetworkMode,
    setCustomNetworkMode,
    autoStart,
    setAutoStart,
    networks,
    isSearchingHub,
    hubResults,
    setHubResults,
    availableTags,
    setAvailableTags,
    selectedTag,
    setSelectedTag,
    isLoadingTags,
    setIsLoadingTags,
    customNames,
    setCustomNames,
    exampleNetworks,
    setExampleNetworks,
    flashCreateBtn,
    customFormRef,
    onPullImage,
    onCreateContainer,
    onApplyExample,
    onGetTags,
  } = props

  const handleHubResultClick = async (name: string): Promise<void> => {
    setPullImage(name)
    setHubResults([])
    setIsLoadingTags(true)
    try {
      const tags = await onGetTags(name)
      setAvailableTags(tags)
      if (tags.includes('latest')) setSelectedTag('latest')
      else if (tags.length > 0) setSelectedTag(tags[0])
    } finally {
      setIsLoadingTags(false)
    }
  }

  return (
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
                const full = pullImage.includes(':') ? pullImage : `${pullImage}:${selectedTag}`
                onPullImage(full)
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
                  onClick={() => void handleHubResultClick(r.name)}
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
      <div className="hp-card" ref={customFormRef}>
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
            className={`hp-btn hp-btn-primary${flashCreateBtn ? ' docker-create-flash' : ''}`}
            onClick={() => onCreateContainer()}
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
            onClick={() => onApplyExample(ex)}
            disabled={busy}
          >
            {t('action.use')}
          </button>
        </div>
      ))}
    </div>
  )
}
