import { assertGitVcsOk } from './gitVcsContract'

/** Best-effort `git fetch origin` so ahead/behind reflect the server (no throw). */
export async function fetchOriginQuiet(repoPath: string): Promise<void> {
  const path = repoPath.trim()
  if (!path) return
  try {
    const res = await window.dh.gitVcsFetch({ repoPath: path, remote: 'origin' })
    assertGitVcsOk(res)
  } catch {
    /* offline or no remote — local status still shown */
  }
}
