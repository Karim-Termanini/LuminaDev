import { z } from 'zod'

/** Built-in `docker/compose/<id>` preset ids — single source for Zod + TypeScript. */
export const COMPOSE_PROFILES = [
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

export type ComposeProfile = (typeof COMPOSE_PROFILES)[number]

export const ComposeProfileSchema = z.enum(COMPOSE_PROFILES)
