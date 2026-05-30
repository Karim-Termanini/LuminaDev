import { describe, expect, it } from 'vitest'

import {
  containerBelongsToComposeProject,
  sanitizeComposeProjectName,
} from '../src/composeProject.js'

describe('composeProject', () => {
  it('sanitizes project names like docker compose -p', () => {
    expect(sanitizeComposeProjectName('Test112')).toBe('test112')
    expect(sanitizeComposeProjectName('My Profile!')).toBe('my-profile-')
  })

  it('matches compose containers by project prefix only', () => {
    expect(containerBelongsToComposeProject('testt11-jupyter-1', 'testt11')).toBe(true)
    expect(containerBelongsToComposeProject('testt112-node-1', 'testt11')).toBe(false)
    expect(containerBelongsToComposeProject('testt112-postgres-1', 'testt112')).toBe(true)
  })
})
