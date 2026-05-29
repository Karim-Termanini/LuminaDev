import type { ComposeProfile, CustomProfileEntry } from '@linux-dev-home/shared'

export type ProfileEnvVar = { key: string; value: string }

export const PORT_ENV_KEYS = new Set([
  'PORT',
  'NODE_PORT',
  'NODE_HMR_PORT',
  'POSTGRES_PORT',
  'JUPYTER_PORT',
  'OLLAMA_PORT',
  'APPIUM_PORT',
  'JSON_SERVER_PORT',
])

export interface EnvConflict {
  key: string
  value: string
  otherProfileName: string
  reason: 'duplicate' | 'port'
}

export interface EnvPreset {
  key: string
  value: string
  labelKey: string
}

const TEMPLATE_PORT_BASES: Partial<Record<ComposeProfile, Array<{ key: string; base: number }>>> = {
  'web-dev': [
    { key: 'NODE_PORT', base: 3000 },
    { key: 'NODE_HMR_PORT', base: 5173 },
    { key: 'POSTGRES_PORT', base: 54321 },
  ],
  'data-science': [
    { key: 'JUPYTER_PORT', base: 8888 },
    { key: 'POSTGRES_PORT', base: 54320 },
  ],
  'ai-ml': [
    { key: 'JUPYTER_PORT', base: 18888 },
    { key: 'OLLAMA_PORT', base: 11434 },
  ],
  mobile: [
    { key: 'APPIUM_PORT', base: 4723 },
    { key: 'JSON_SERVER_PORT', base: 3000 },
  ],
  infra: [{ key: 'POSTGRES_PORT', base: 54322 }],
}

export function isPortSensitiveKey(key: string): boolean {
  const upper = key.trim().toUpperCase()
  return PORT_ENV_KEYS.has(upper) || upper === 'DATABASE_URL'
}

export function parsePortFromEnv(key: string, value: string): number | null {
  const upper = key.trim().toUpperCase()
  if (PORT_ENV_KEYS.has(upper)) {
    const n = Number.parseInt(value.trim(), 10)
    return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null
  }
  if (upper === 'DATABASE_URL') {
    const match = value.match(/:(\d{2,5})(?:\/|$)/)
    if (match) {
      const n = Number.parseInt(match[1], 10)
      return Number.isFinite(n) ? n : null
    }
    return 5432
  }
  return null
}

export function collectUsedPorts(
  profiles: CustomProfileEntry[],
  excludeIdx: number | null
): Set<number> {
  const used = new Set<number>()
  profiles.forEach((profile, idx) => {
    if (excludeIdx !== null && idx === excludeIdx) return
    for (const ev of profile.envVars ?? []) {
      const port = parsePortFromEnv(ev.key, ev.value)
      if (port !== null) used.add(port)
    }
  })
  return used
}

export function nextFreePort(preferred: number, used: Set<number>): number {
  let candidate = preferred
  for (let i = 0; i < 500; i++) {
    if (!used.has(candidate)) return candidate
    candidate += 1
  }
  return preferred + 500
}

export function findEnvConflicts(
  profiles: CustomProfileEntry[],
  wizardEnvVars: ProfileEnvVar[],
  editingIdx: number | null
): EnvConflict[] {
  const conflicts: EnvConflict[] = []
  const seen = new Set<string>()

  for (const ev of wizardEnvVars) {
    if (!isPortSensitiveKey(ev.key)) continue
    for (let i = 0; i < profiles.length; i++) {
      if (editingIdx !== null && i === editingIdx) continue
      const other = profiles[i]
      for (const otherEv of other.envVars ?? []) {
        if (!isPortSensitiveKey(otherEv.key)) continue

        const sameKey = otherEv.key.toUpperCase() === ev.key.toUpperCase()
        if (sameKey && otherEv.value === ev.value) {
          const id = `dup:${ev.key}:${ev.value}:${other.name}`
          if (!seen.has(id)) {
            seen.add(id)
            conflicts.push({
              key: ev.key,
              value: ev.value,
              otherProfileName: other.name,
              reason: 'duplicate',
            })
          }
        }

        const wizardPort = parsePortFromEnv(ev.key, ev.value)
        const otherPort = parsePortFromEnv(otherEv.key, otherEv.value)
        if (
          wizardPort !== null &&
          otherPort !== null &&
          wizardPort === otherPort &&
          !(sameKey && otherEv.value === ev.value)
        ) {
          const id = `port:${wizardPort}:${other.name}:${ev.key}`
          if (!seen.has(id)) {
            seen.add(id)
            conflicts.push({
              key: ev.key,
              value: String(wizardPort),
              otherProfileName: other.name,
              reason: 'port',
            })
          }
        }
      }
    }
  }

  return conflicts
}

export function buildDatabaseUrl(template: ComposeProfile, hostPort: number): string {
  if (template === 'data-science') {
    return `postgresql://postgres:luminadev@localhost:${hostPort}/datasci`
  }
  return `postgresql://postgres:luminadev@localhost:${hostPort}/webapp`
}

export function getTemplateEnvPresets(
  template: ComposeProfile,
  profileName: string,
  profiles: CustomProfileEntry[],
  editingIdx: number | null
): EnvPreset[] {
  const used = collectUsedPorts(profiles, editingIdx)
  const slug = profileName.trim() || 'profile'
  const portOffset = Math.abs(hashString(slug)) % 50

  const presets: EnvPreset[] = []
  const portBases = TEMPLATE_PORT_BASES[template] ?? []

  for (const { key, base } of portBases) {
    const preferred = base + portOffset
    const port = nextFreePort(preferred, used)
    used.add(port)
    presets.push({
      key,
      value: String(port),
      labelKey: `preset.${key.toLowerCase()}`,
    })
  }

  if (template === 'web-dev' || template === 'data-science') {
    const pgPreset = presets.find((p) => p.key === 'POSTGRES_PORT')
    if (pgPreset) {
      presets.push({
        key: 'DATABASE_URL',
        value: buildDatabaseUrl(template, Number.parseInt(pgPreset.value, 10)),
        labelKey: 'preset.databaseUrl',
      })
    }
  }

  presets.push(
    { key: 'NODE_ENV', value: 'development', labelKey: 'preset.devMode' },
    { key: 'DEBUG', value: '*', labelKey: 'preset.debugLogs' }
  )

  return presets
}

export function generateUniqueEnvVars(
  template: ComposeProfile,
  profileName: string,
  profiles: CustomProfileEntry[],
  editingIdx: number | null,
  currentVars: ProfileEnvVar[]
): ProfileEnvVar[] {
  const used = collectUsedPorts(profiles, editingIdx)
  const result: ProfileEnvVar[] = []

  for (const ev of currentVars) {
    if (!isPortSensitiveKey(ev.key)) {
      result.push({ ...ev })
      continue
    }

    const port = parsePortFromEnv(ev.key, ev.value)
    if (port === null) {
      result.push({ ...ev })
      continue
    }

    if (!used.has(port)) {
      used.add(port)
      result.push({ ...ev })
      continue
    }

    const bases = TEMPLATE_PORT_BASES[template] ?? []
    const baseEntry = bases.find((b) => b.key.toUpperCase() === ev.key.toUpperCase())
    const preferred = baseEntry?.base ?? port
    const free = nextFreePort(preferred, used)
    used.add(free)

    if (ev.key.toUpperCase() === 'DATABASE_URL') {
      result.push({ key: ev.key, value: buildDatabaseUrl(template, free) })
    } else {
      result.push({ key: ev.key, value: String(free) })
    }
  }

  return result
}

export function suggestUniqueProfileName(
  desired: string,
  profiles: CustomProfileEntry[],
  editingIdx: number | null
): string {
  const base = desired.trim() || 'Profile'
  const taken = new Set(
    profiles
      .filter((_, idx) => idx !== editingIdx)
      .map((p) => p.name.trim().toLowerCase())
  )
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return hash
}
