import type { ReactElement } from 'react'
import type { ImageRow } from '@linux-dev-home/shared'

interface DockerImagesTabProps {
  t: (key: string) => string
  busy: boolean
  images: ImageRow[]
  onDeployImage: (img: ImageRow) => void
  onPullImage: (fullImage: string) => void
  onRemoveImage: (id: string) => void
}

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

export function DockerImagesTab(props: DockerImagesTabProps): ReactElement {
  const { t, busy, images, onDeployImage, onPullImage, onRemoveImage } = props

  return (
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
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
                  onPullImage(img)
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
                    onClick={() => onDeployImage(img)}
                    disabled={busy}
                  >
                    {t('image.deploy')}
                  </button>
                  <button
                    type="button"
                    style={{ ...btnSmallDanger, flex: 1 }}
                    onClick={() => onRemoveImage(img.id)}
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
  )
}
