export const RUNNING_CACHE_KEY = 'dh:profiles:running-cache:v1'
export const RUNNING_CACHE_TTL = 30 * 1000 // 30 seconds

export const BASE_TEMPLATES = [
  'web-dev',
  'data-science',
  'ai-ml',
  'mobile',
  'game-dev',
  'infra',
  'desktop-gui',
  'docs',
  'empty',
] as const

export const TEMPLATE_ICONS: Record<string, string> = {
  'web-dev': 'globe',
  'data-science': 'graph',
  'ai-ml': 'hubot',
  mobile: 'device-mobile',
  'game-dev': 'play-circle',
  infra: 'server-environment',
  'desktop-gui': 'window',
  docs: 'book',
  empty: 'blank',
}
