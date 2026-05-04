export type GitVcsTrackedPrEntry = { url: string; reference: string }

/** Up to one tracked PR/MR per known cloud host (same branch can be pushed to both). */
export type GitVcsPrTrackingState = Partial<Record<'github' | 'gitlab', GitVcsTrackedPrEntry>>

function isTrackedEntry(x: unknown): x is GitVcsTrackedPrEntry {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.url === 'string' && typeof o.reference === 'string'
}

/**
 * Reads persisted `vcs_pr_tracking_*` payload: new shape `{ github?, gitlab? }` or legacy `{ url, reference, provider }`.
 */
export function parseGitVcsPrTrackingFromStore(raw: unknown): GitVcsPrTrackingState {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  if (isTrackedEntry(o) && (o.provider === 'github' || o.provider === 'gitlab')) {
    const p = o.provider as 'github' | 'gitlab'
    return { [p]: { url: o.url as string, reference: o.reference as string } }
  }
  const out: GitVcsPrTrackingState = {}
  if (isTrackedEntry(o.github)) out.github = o.github
  if (isTrackedEntry(o.gitlab)) out.gitlab = o.gitlab
  return out
}

/** Returns `null` when the store entry should be removed. */
export function gitVcsPrTrackingSnapshotForStore(state: GitVcsPrTrackingState): GitVcsPrTrackingState | null {
  if (!state.github && !state.gitlab) return null
  const snap: GitVcsPrTrackingState = {}
  if (state.github) snap.github = state.github
  if (state.gitlab) snap.gitlab = state.gitlab
  return snap
}
