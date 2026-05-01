export function dockerHubRepositoryUrl(name: string): string {
  const repo = name.trim().replace(/^docker\.io\//, '')
  if (!repo) return 'https://hub.docker.com'

  if (repo.startsWith('library/')) {
    return `https://hub.docker.com/_/${repo.slice('library/'.length)}`
  }

  if (!repo.includes('/')) {
    return `https://hub.docker.com/_/${repo}`
  }

  return `https://hub.docker.com/r/${repo}`
}
