import type { ReactElement } from 'react'
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GLASS } from '../layout/GLASS'

type ReadinessReport = {
  hardware: {
    cpu_model: string
    cpu_cores: number
    architecture: string
    ram_total_gb: number
    ram_free_gb: number
    disk_total_gb: number
    disk_free_gb: number
  }
  software: {
    docker_installed: boolean
    docker_running: boolean
    docker_version: string
    in_docker_group: boolean
    kvm_supported: boolean
  }
  network: {
    github_latency_ms: number | null
    gitlab_latency_ms: number | null
    docker_hub_latency_ms: number | null
  }
  tools: {
    curl: boolean
    tar: boolean
    unzip: boolean
    git: boolean
  }
}

type Category = 'hardware' | 'docker' | 'virtualization' | 'network' | 'tools'

export function SystemReadinessPage(): ReactElement {
  const { t } = useTranslation('readiness')
  const [report, setReport] = useState<ReadinessReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category>('hardware')
  const [fixing, setFixing] = useState<string | null>(null)

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res = (await window.dh.systemReadinessCheck()) as {
        ok: boolean
        report: ReadinessReport
      }
      if (res.ok) setReport(res.report)
    } catch (e) {
      console.error('Readiness check failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchReport()
  }, [])

  const categories = useMemo(
    () => [
      { id: 'hardware' as Category, label: t('system.categoryHardware'), icon: 'server' },
      { id: 'docker' as Category, label: t('system.categoryDocker'), icon: 'package' },
      {
        id: 'virtualization' as Category,
        label: t('system.categoryVirtualization'),
        icon: 'circuit-board',
      },
      { id: 'network' as Category, label: t('system.categoryNetwork'), icon: 'globe' },
      { id: 'tools' as Category, label: t('system.categoryTools'), icon: 'tools' },
    ],
    [t]
  )

  const renderHardware = () => {
    if (!report) return null
    const { hardware } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>{t('system.hardware.title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <StatCard
            label={t('system.hardware.cpuModel')}
            value={hardware.cpu_model}
            subValue={t('system.hardware.cores', { cores: hardware.cpu_cores })}
          />
          <StatCard
            label={t('system.hardware.architecture')}
            value={hardware.architecture}
            subValue={
              hardware.architecture === 'x86_64'
                ? t('system.hardware.supported')
                : t('system.hardware.unsupported')
            }
            status={hardware.architecture === 'x86_64' ? 'ok' : 'warning'}
          />
          <StatCard
            label={t('system.hardware.ram')}
            value={t('system.hardware.ramValue', { gb: hardware.ram_total_gb.toFixed(1) })}
            subValue={t('system.hardware.ramAvailable', { gb: hardware.ram_free_gb.toFixed(1) })}
            status={hardware.ram_total_gb < 4 ? 'warning' : 'ok'}
          />
          <StatCard
            label={t('system.hardware.storage')}
            value={t('system.hardware.storageValue', { gb: hardware.disk_total_gb.toFixed(1) })}
            subValue={t('system.hardware.storageFree', { gb: hardware.disk_free_gb.toFixed(1) })}
            status={hardware.disk_free_gb < 10 ? 'warning' : 'ok'}
          />
        </div>
      </div>
    )
  }

  const renderDocker = () => {
    if (!report) return null
    const { software } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>{t('system.docker.title')}</h2>
        <CheckRow
          label={t('system.docker.installed')}
          status={software.docker_installed}
          desc={
            software.docker_installed
              ? t('system.docker.version', { version: software.docker_version })
              : t('system.docker.notFound')
          }
        />
        <CheckRow
          label={t('system.docker.daemon')}
          status={software.docker_running}
          desc={
            software.docker_running ? t('system.docker.running') : t('system.docker.notResponding')
          }
          onFix={
            !software.docker_running
              ? async () => {
                  setFixing('docker-start')
                  try {
                    const res = await window.dh.systemReadinessFix({ id: 'docker-start' })
                    if (res.ok) await fetchReport()
                    else alert(res.error)
                  } finally {
                    setFixing(null)
                  }
                }
              : undefined
          }
          isFixing={fixing === 'docker-start'}
        />
        <CheckRow
          label={t('system.docker.permissions')}
          status={software.in_docker_group}
          desc={
            software.in_docker_group ? t('system.docker.inGroup') : t('system.docker.missingPerms')
          }
          onFix={
            !software.in_docker_group
              ? async () => {
                  setFixing('docker-group')
                  try {
                    const res = await window.dh.systemReadinessFix({ id: 'docker-group' })
                    if (res.ok) alert(t('system.docker.groupAdded'))
                    else alert(res.error)
                    await fetchReport()
                  } finally {
                    setFixing(null)
                  }
                }
              : undefined
          }
          isFixing={fixing === 'docker-group'}
        />
      </div>
    )
  }

  const renderVirtualization = () => {
    if (!report) return null
    const { software } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>{t('system.virt.title')}</h2>
        <CheckRow
          label={t('system.virt.kvm')}
          status={software.kvm_supported}
          desc={software.kvm_supported ? t('system.virt.available') : t('system.virt.notDetected')}
        />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('system.virt.hint')}</p>
      </div>
    )
  }

  const renderNetwork = () => {
    if (!report) return null
    const { network } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>{t('system.network.title')}</h2>
        <LatencyRow label={t('system.network.github')} latency={network.github_latency_ms} />
        <LatencyRow label={t('system.network.gitlab')} latency={network.gitlab_latency_ms} />
        <LatencyRow label={t('system.network.dockerHub')} latency={network.docker_hub_latency_ms} />
      </div>
    )
  }

  const renderTools = () => {
    if (!report) return null
    const { tools } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>{t('system.tools.title')}</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <ToolBadge label={t('system.tools.git')} status={tools.git} />
          <ToolBadge label={t('system.tools.curl')} status={tools.curl} />
          <ToolBadge label={t('system.tools.tar')} status={tools.tar} />
          <ToolBadge label={t('system.tools.unzip')} status={tools.unzip} />
        </div>
      </div>
    )
  }

  return (
    <div className="elevated-page" style={{ display: 'flex', gap: 32, height: '100%' }}>
      <aside style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          className="mono"
          style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 12px 12px' }}
        >
          {t('system.sidebarTitle')}
        </div>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: activeCategory === cat.id ? 'var(--accent-dim)' : 'transparent',
              color: activeCategory === cat.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: activeCategory === cat.id ? 600 : 500,
              transition: 'all 0.2s ease',
            }}
          >
            <span className={`codicon codicon-${cat.icon}`} />
            {cat.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: 12 }}>
          <button
            className="hp-btn hp-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={fetchReport}
            disabled={loading}
          >
            {loading ? t('system.auditLoading') : t('system.audit')}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, ...GLASS, borderRadius: 24, padding: 32, overflow: 'auto' }}>
        {loading && !report ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              className="codicon codicon-loading codicon-modifier-spin"
              style={{ fontSize: 32 }}
            />
            <div className="mono" style={{ color: 'var(--text-muted)' }}>
              {t('system.loadingProbing')}
            </div>
          </div>
        ) : (
          <>
            {activeCategory === 'hardware' && renderHardware()}
            {activeCategory === 'docker' && renderDocker()}
            {activeCategory === 'virtualization' && renderVirtualization()}
            {activeCategory === 'network' && renderNetwork()}
            {activeCategory === 'tools' && renderTools()}
          </>
        )}
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  subValue,
  status = 'ok',
}: {
  label: string
  value: string
  subValue: string
  status?: 'ok' | 'warning' | 'error'
}) {
  const color =
    status === 'ok' ? 'var(--green)' : status === 'warning' ? 'var(--orange)' : 'var(--red)'
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'var(--bg-input)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subValue}</div>
    </div>
  )
}

function CheckRow({
  label,
  status,
  desc,
  onFix,
  isFixing,
}: {
  label: string
  status: boolean
  desc: string
  onFix?: () => void
  isFixing?: boolean
}) {
  const { t } = useTranslation('readiness')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        borderRadius: 16,
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: status
            ? 'color-mix(in srgb, var(--green) 12%, transparent)'
            : 'color-mix(in srgb, var(--red) 12%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: status ? 'var(--green)' : 'var(--red)',
        }}
      >
        {isFixing ? (
          <span className="codicon codicon-loading codicon-modifier-spin" />
        ) : (
          <span className={`codicon codicon-${status ? 'check' : 'close'}`} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      {onFix && (
        <button
          className="hp-btn hp-btn-primary"
          onClick={onFix}
          style={{ fontSize: 12, padding: '4px 12px' }}
          disabled={isFixing}
        >
          {isFixing ? t('system.docker.fixing') : t('system.docker.fixIt')}
        </button>
      )}
    </div>
  )
}

function LatencyRow({ label, latency }: { label: string; latency: number | null }) {
  const { t } = useTranslation('readiness')
  const status = latency === null ? 'error' : latency > 500 ? 'warning' : 'ok'
  const color =
    status === 'ok' ? 'var(--green)' : status === 'warning' ? 'var(--orange)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}>
      <div className="mono" style={{ width: 100 }}>
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 4,
          background: 'var(--border)',
          borderRadius: 2,
          position: 'relative',
        }}
      >
        {latency !== null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.min(latency / 10, 100)}%`,
              background: color,
              borderRadius: 2,
            }}
          />
        )}
      </div>
      <div className="mono" style={{ width: 80, textAlign: 'right', color }}>
        {latency === null ? t('system.network.timeout') : t('system.network.ms', { ms: latency })}
      </div>
    </div>
  )
}

function ToolBadge({ label, status }: { label: string; status: boolean }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: status ? 1 : 0.5,
        background: status ? 'color-mix(in srgb, var(--green) 6%, transparent)' : 'transparent',
      }}
    >
      <span
        className={`codicon codicon-${status ? 'pass' : 'error'}`}
        style={{ color: status ? 'var(--green)' : 'var(--red)' }}
      />
      <span className="mono" style={{ fontSize: 13 }}>
        {label}
      </span>
    </div>
  )
}
