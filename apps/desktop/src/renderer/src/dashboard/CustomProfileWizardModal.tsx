import { ComposeProfileSchema, type ComposeProfile, type CustomProfileEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useState } from 'react'

const PROFILE_LABELS: Record<ComposeProfile, string> = {
  'web-dev': 'Web Development',
  'data-science': 'Python Data Science',
  'ai-ml': 'AI/ML Local',
  mobile: 'Mobile App Dev',
  'game-dev': 'Game Development',
  infra: 'Infra / K8s',
  'desktop-gui': 'Desktop Qt/GTK',
  docs: 'Docs / Writing',
  empty: 'Empty Minimal',
}

const PROFILE_ORDER = ComposeProfileSchema.options

export function CustomProfileWizardModal(props: {
  open: boolean
  onClose: () => void
  onSave: (data: CustomProfileEntry) => void
}): ReactElement | null {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<ComposeProfile>('web-dev')

  if (!props.open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Create Custom Profile</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Define a new custom profile by selecting a base template (nine presets use the same Alpine stub compose until
          real stacks land).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Profile Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Next.js Setup"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Base Template
            </label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ComposeProfile)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
              }}
            >
              {PROFILE_ORDER.map((id) => (
                <option key={id} value={id}>
                  {PROFILE_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              props.onSave({ name: name.trim(), baseTemplate: template })
              setName('')
            }}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.5,
              fontWeight: 600,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
