/** True when `/git` points at this app's source tree during Vite dev (branch switch can restart the app). */
export function isDevAppSourceRepo(repoPath: string): boolean {
  if (!import.meta.env.DEV) return false
  const norm = repoPath.trim().replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
  if (!norm) return false
  return norm.endsWith('/luminadev') || norm.includes('/luminadev/')
}
