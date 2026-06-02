export const RUNTIME_DETAILS: Record<string, { website: string; icon: string }> = {
  node: { website: 'https://nodejs.org', icon: 'symbol-method' },
  rust: { website: 'https://rust-lang.org', icon: 'tools' },
  python: { website: 'https://python.org', icon: 'symbol-keyword' },
  go: { website: 'https://go.dev', icon: 'zap' },
  java: { website: 'https://java.com', icon: 'beaker' },
  php: { website: 'https://php.net', icon: 'globe' },
  dotnet: { website: 'https://dotnet.microsoft.com', icon: 'library' },
}

export const UPDATE_OUTCOME_STORAGE_KEY = 'dh:runtimes:update-outcomes:v2'
export const STATUS_CACHE_KEY = 'dh:runtimes:status-cache:v2'
export const STATUS_CACHE_TTL = 30 * 1000
export const VERSIONS_CACHE_KEY = 'dh:runtimes:versions-cache:v2'
export const VERSIONS_CACHE_TTL = 5 * 60 * 1000
