import type { ComposeProfile } from '@linux-dev-home/shared'

export interface ProfileDef {
  name: string
  title: string
  description: string
  icon: string
  accent: string
  status: 'live' | 'planned'
  isCustom?: boolean
  baseTemplate?: ComposeProfile
}

export interface Toast {
  type: 'success' | 'error'
  message: string
}

export const PREFERRED_EDITOR_KEY = 'dh:preferred_editor_cmd'

export function pickPreferredEditorCmd(
  editors: Array<{ name: string; cmd: string }>,
  previous: string
): string {
  try {
    const saved = localStorage.getItem(PREFERRED_EDITOR_KEY)
    if (saved && editors.some((e) => e.cmd === saved)) return saved
  } catch {
    /* ignore */
  }
  if (previous && editors.some((e) => e.cmd === previous)) return previous
  return editors[0]?.cmd ?? ''
}

export function persistPreferredEditorCmd(cmd: string): void {
  if (!cmd) return
  try {
    localStorage.setItem(PREFERRED_EDITOR_KEY, cmd)
  } catch {
    /* ignore */
  }
}

export const PRESET_PROFILES: ProfileDef[] = [
  {
    name: 'web-dev',
    title: 'Web Development',
    description: 'Dockerized web stack with nginx placeholder and hot-reload friendly layout.',
    icon: 'globe',
    accent: 'var(--accent)',
    status: 'live',
  },
  {
    name: 'data-science',
    title: 'Data Science',
    description: 'Pandas, NumPy, Matplotlib & Jupyter Lab. Standard analytics stack.',
    icon: 'graph',
    accent: 'var(--green)',
    status: 'live',
  },
  {
    name: 'ai-ml',
    title: 'AI/ML Local',
    description: 'PyTorch + Jupyter environment. Ready for CUDA workloads (requires host drivers).',
    icon: 'hubot',
    accent: 'var(--blue)',
    status: 'live',
  },
  {
    name: 'mobile',
    title: 'Mobile App Dev',
    description:
      'Appium test server + JSON mock API. Supports React Native and Flutter sub-templates.',
    icon: 'device-mobile',
    accent: 'var(--green)',
    status: 'live',
  },
  {
    name: 'game-dev',
    title: 'Game Development',
    description:
      'Redis session store + headless game server container for local multiplayer testing.',
    icon: 'play-circle',
    accent: 'var(--yellow)',
    status: 'live',
  },
  {
    name: 'infra',
    title: 'Infra / K8s',
    description:
      'Traefik reverse proxy, Portainer management UI, and Prometheus metrics — full local infra stack.',
    icon: 'server-environment',
    accent: 'var(--purple)',
    status: 'live',
  },
  {
    name: 'desktop-gui',
    title: 'Desktop Qt/GTK',
    description:
      'Xpra remote display server for running and testing native GUI applications in containers.',
    icon: 'window',
    accent: 'var(--cyan)',
    status: 'live',
  },
  {
    name: 'docs',
    title: 'Docs / Writing',
    description: 'Jekyll/Hugo/Docusaurus writing environment.',
    icon: 'book',
    accent: 'var(--red)',
    status: 'live',
  },
  {
    name: 'empty',
    title: 'Empty Minimal',
    description: 'Clean slate alpine image for general scripting.',
    icon: 'blank',
    accent: 'var(--text-muted)',
    status: 'live',
  },
]
