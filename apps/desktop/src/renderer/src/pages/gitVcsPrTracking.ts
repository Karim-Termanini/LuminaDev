export type GitVcsTrackedPrEntry = { url: string; reference: string }

/** Up to one tracked PR/MR per known cloud host (same branch can be pushed to both). */
export type GitVcsPrTrackingState = Partial<Record<'github' | 'gitlab', GitVcsTrackedPrEntry>>

function isTrackedEntry(x: unknown): x is GitVcsTrackedPrEntry {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.url === 'string' && typeof o.reference === 'string'
}

/** Legacy store row: single host + `provider` field. */
function parseLegacySingleHostRow(o: Record<string, unknown>): GitVcsPrTrackingState | null {
  const url = o.url
  const reference = o.reference
  const provider = o.provider
  if (
    typeof url === 'string' &&
    typeof reference === 'string' &&
    (provider === 'github' || provider === 'gitlab')
  ) {
    return { [provider]: { url, reference } }
  }
  return null
}

/**
 * Reads persisted `vcs_pr_tracking_*` payload: new shape `{ github?, gitlab? }` or legacy `{ url, reference, provider }`.
 */
export function parseGitVcsPrTrackingFromStore(raw: unknown): GitVcsPrTrackingState {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const legacy = parseLegacySingleHostRow(o)
  if (legacy) return legacy
  const out: GitVcsPrTrackingState = {}
  const ghRaw = o.github
  const glRaw = o.gitlab
  if (ghRaw !== undefined && ghRaw !== null && typeof ghRaw === 'object' && isTrackedEntry(ghRaw)) {
    out.github = ghRaw
  }
  if (glRaw !== undefined && glRaw !== null && typeof glRaw === 'object' && isTrackedEntry(glRaw)) {
    out.gitlab = glRaw
  }
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
