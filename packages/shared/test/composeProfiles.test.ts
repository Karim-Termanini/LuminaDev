import { describe, expect, it } from 'vitest'
import { COMPOSE_PROFILES, ComposeProfileSchema } from '../src/composeProfiles.js'

describe('composeProfiles', () => {
  it('keeps Zod enum options aligned with COMPOSE_PROFILES tuple', () => {
    expect(ComposeProfileSchema.options).toEqual([...COMPOSE_PROFILES])
    expect(COMPOSE_PROFILES).toHaveLength(9)
  })

  it('rejects unknown preset ids', () => {
    expect(ComposeProfileSchema.safeParse('unknown').success).toBe(false)
  })
})
