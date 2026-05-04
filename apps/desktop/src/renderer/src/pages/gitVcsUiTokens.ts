import type { CSSProperties } from 'react'

/** Green ring + glow for “next step” controls (matches workflow hints). */
export const GIT_VCS_NEXT_ACTION_RING: CSSProperties = {
  boxShadow: '0 0 0 2px rgba(105, 240, 174, 0.95), 0 0 18px rgba(105, 240, 174, 0.35)',
  borderRadius: 8,
}
