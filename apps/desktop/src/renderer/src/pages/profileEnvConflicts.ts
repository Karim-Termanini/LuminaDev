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

/** Maps `dh:ports:suggest` service keys to compose env var names. */
export const PORTS_SUGGEST_SERVICE_TO_ENV: Record<string, string> = {
  node: 'NODE_PORT',
  node_hmr: 'NODE_HMR_PORT',
  postgres: 'POSTGRES_PORT',
  jupyter: 'JUPYTER_PORT',
  ollama: 'OLLAMA_PORT',
  appium: 'APPIUM_PORT',
  json_server: 'JSON_SERVER_PORT',
}

const TEMPLATE_SERVICE_MAP: Partial<Record<ComposeProfile, Record<string, string>>> = {
  'web-dev': {
    node: 'NODE_PORT',
    node_hmr: 'NODE_HMR_PORT',
    postgres: 'POSTGRES_PORT',
  },
  'data-science': {
    jupyter: 'JUPYTER_PORT',
    postgres: 'POSTGRES_PORT',
  },
  'ai-ml': {
    jupyter: 'JUPYTER_PORT',
    ollama: 'OLLAMA_PORT',
  },
  mobile: {
    appium: 'APPIUM_PORT',
    json_server: 'JSON_SERVER_PORT',
  },
  infra: {
    postgres: 'POSTGRES_PORT',
  },
}

export interface EnvConflict {
  key: string
  value: string
  otherProfileName: string
  reason: 'duplicate' | 'port' | 'internal'
}

export interface EnvPreset {
  key: string
  value: string
  labelKey: string
}

const BEGINNER_OPTIONAL_ENV_KEYS = new Set(['NODE_ENV', 'DEBUG'])

export function partitionBeginnerEnvPresets(presets: EnvPreset[]): {
  recommended: EnvPreset[]
  optional: EnvPreset[]
} {
  const recommended: EnvPreset[] = []
  const optional: EnvPreset[] = []
  for (const preset of presets) {
    if (BEGINNER_OPTIONAL_ENV_KEYS.has(preset.key.toUpperCase())) {
      optional.push(preset)
    } else {
      recommended.push(preset)
    }
  }
  return { recommended, optional }
}

export function beginnerBundleLabelKey(template: ComposeProfile): string {
  return `wizard.env.beginner.bundle.${template}`
}

export function mergeEnvPresetBundle(
  current: ProfileEnvVar[],
  bundle: EnvPreset[],
  add: boolean
): ProfileEnvVar[] {
  const keys = new Set(bundle.map((p) => p.key.toUpperCase()))
  if (!add) {
    return current.filter((v) => !keys.has(v.key.toUpperCase()))
  }
  const without = current.filter((v) => !keys.has(v.key.toUpperCase()))
  return [...without, ...bundle.map((p) => ({ key: p.key, value: p.value }))]
}

export function isBeginnerBundleApplied(
  current: ProfileEnvVar[],
  bundle: EnvPreset[]
): boolean {
  if (bundle.length === 0) return false
  return bundle.every((p) =>
    current.some(
      (v) => v.key.toUpperCase() === p.key.toUpperCase() && v.value === p.value
    )
  )
}

export interface RuntimeAssignedPort {
  profileName: string
  envKey: string
  port: number
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

/** Same host port in both vars is expected (e.g. DATABASE_URL embeds POSTGRES_PORT). */
export function areLinkedPortEnvKeys(a: string, b: string): boolean {
  const left = a.trim().toUpperCase()
  const right = b.trim().toUpperCase()
  return (
    (left === 'DATABASE_URL' && right === 'POSTGRES_PORT') ||
    (left === 'POSTGRES_PORT' && right === 'DATABASE_URL')
  )
}

export function parsePortFromEnv(key: string, value: string): number | null {
  const upper = key.trim().toUpperCase()
  if (PORT_ENV_KEYS.has(upper)) {
    const n = Number.parseInt(value.trim(), 10)
    return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null
  }
  if (upper === 'DATABASE_URL') {
    const match = value.match(/@(?:[^:/@]+|\[[^\]]+\]):(\d{2,5})(?:\/|$)/)
    if (match) {
      const n = Number.parseInt(match[1], 10)
      return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null
    }
    const hostMatch = value.match(/:(\d{2,5})(?:\/|$)/)
    if (hostMatch) {
      const n = Number.parseInt(hostMatch[1], 10)
      return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null
    }
    return 5432
  }
  return null
}

export function collectUsedPorts(
  profiles: CustomProfileEntry[],
  excludeIdx: number | null,
  runtimePorts: RuntimeAssignedPort[] = []
): Set<number> {
  const used = new Set<number>()
  profiles.forEach((profile, idx) => {
    if (excludeIdx !== null && idx === excludeIdx) return
    for (const ev of profile.envVars ?? []) {
      const port = parsePortFromEnv(ev.key, ev.value)
      if (port !== null) used.add(port)
    }
  })
  for (const rp of runtimePorts) {
    used.add(rp.port)
  }
  return used
}

export function runtimePortsFromSuggest(
  profileName: string,
  ports: Record<string, number>
): RuntimeAssignedPort[] {
  return Object.entries(ports).map(([service, port]) => ({
    profileName,
    envKey: PORTS_SUGGEST_SERVICE_TO_ENV[service] ?? service.toUpperCase(),
    port: Number(port),
  }))
}

export function nextFreePort(preferred: number, used: Set<number>): number {
  let candidate = preferred
  for (let i = 0; i < 500; i++) {
    if (candidate > 65535) candidate = 1024
    if (!used.has(candidate)) return candidate
    candidate += 1
  }
  return Math.min(preferred + 500, 65535)
}

function pushConflict(
  conflicts: EnvConflict[],
  seen: Set<string>,
  conflict: EnvConflict
): void {
  const id = `${conflict.reason}:${conflict.key}:${conflict.value}:${conflict.otherProfileName}`
  if (seen.has(id)) return
  seen.add(id)
  conflicts.push(conflict)
}

export function findEnvConflicts(
  profiles: CustomProfileEntry[],
  wizardEnvVars: ProfileEnvVar[],
  editingIdx: number | null,
  runtimePorts: RuntimeAssignedPort[] = []
): EnvConflict[] {
  const conflicts: EnvConflict[] = []
  const seen = new Set<string>()

  for (const ev of wizardEnvVars) {
    if (!isPortSensitiveKey(ev.key)) continue
    const wizardPort = parsePortFromEnv(ev.key, ev.value)

    for (let i = 0; i < profiles.length; i++) {
      if (editingIdx !== null && i === editingIdx) continue
      const other = profiles[i]
      for (const otherEv of other.envVars ?? []) {
        if (!isPortSensitiveKey(otherEv.key)) continue

        const sameKey = otherEv.key.toUpperCase() === ev.key.toUpperCase()
        if (sameKey && otherEv.value === ev.value) {
          pushConflict(conflicts, seen, {
            key: ev.key,
            value: ev.value,
            otherProfileName: other.name,
            reason: 'duplicate',
          })
        }

        const otherPort = parsePortFromEnv(otherEv.key, otherEv.value)
        if (
          wizardPort !== null &&
          otherPort !== null &&
          wizardPort === otherPort &&
          !(sameKey && otherEv.value === ev.value)
        ) {
          pushConflict(conflicts, seen, {
            key: ev.key,
            value: String(wizardPort),
            otherProfileName: other.name,
            reason: 'port',
          })
        }
      }
    }

    if (wizardPort !== null) {
      for (const rp of runtimePorts) {
        if (rp.port !== wizardPort) continue
        const sameKey = rp.envKey.toUpperCase() === ev.key.toUpperCase()
        if (sameKey) {
          pushConflict(conflicts, seen, {
            key: ev.key,
            value: String(wizardPort),
            otherProfileName: rp.profileName,
            reason: 'duplicate',
          })
        } else {
          pushConflict(conflicts, seen, {
            key: ev.key,
            value: String(wizardPort),
            otherProfileName: rp.profileName,
            reason: 'port',
          })
        }
      }
    }
  }

  const portsInWizard = new Map<number, string>()
  for (const ev of wizardEnvVars) {
    if (!isPortSensitiveKey(ev.key)) continue
    const port = parsePortFromEnv(ev.key, ev.value)
    if (port === null) continue
    const priorKey = portsInWizard.get(port)
    if (
      priorKey &&
      priorKey !== ev.key.toUpperCase() &&
      !areLinkedPortEnvKeys(priorKey, ev.key)
    ) {
      pushConflict(conflicts, seen, {
        key: ev.key,
        value: String(port),
        otherProfileName: '__self__',
        reason: 'internal',
      })
    } else {
      portsInWizard.set(port, ev.key.toUpperCase())
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

export function syncDatabaseUrlWithPostgres(
  vars: ProfileEnvVar[],
  template: ComposeProfile
): ProfileEnvVar[] {
  const pg = vars.find((v) => v.key.toUpperCase() === 'POSTGRES_PORT')
  if (!pg) return vars
  const pgPort = Number.parseInt(pg.value, 10)
  if (!Number.isFinite(pgPort)) return vars
  return vars.map((v) =>
    v.key.toUpperCase() === 'DATABASE_URL'
      ? { ...v, value: buildDatabaseUrl(template, pgPort) }
      : v
  )
}

export function envPresetsFromPortSuggest(
  template: ComposeProfile,
  ports: Record<string, number>
): EnvPreset[] {
  const serviceMap = TEMPLATE_SERVICE_MAP[template] ?? {}
  const presets: EnvPreset[] = []

  for (const [service, envKey] of Object.entries(serviceMap)) {
    const port = ports[service]
    if (port === undefined) continue
    presets.push({
      key: envKey,
      value: String(port),
      labelKey: `preset.${envKey.toLowerCase()}`,
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

  return presets
}

export function getTemplateEnvPresets(
  template: ComposeProfile,
  profileName: string,
  profiles: CustomProfileEntry[],
  editingIdx: number | null,
  runtimePorts: RuntimeAssignedPort[] = []
): EnvPreset[] {
  const used = collectUsedPorts(profiles, editingIdx, runtimePorts)
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

  return presets
}

/** Optional dev toggles shown separately in beginner wizard (not in port bundle). */
export function beginnerOptionalEnvPresets(): EnvPreset[] {
  return [
    { key: 'NODE_ENV', value: 'development', labelKey: 'wizard.env.beginner.devMode' },
    { key: 'DEBUG', value: '*', labelKey: 'wizard.env.beginner.debugLogs' },
  ]
}

export function generateUniqueEnvVars(
  template: ComposeProfile,
  profileName: string,
  profiles: CustomProfileEntry[],
  editingIdx: number | null,
  currentVars: ProfileEnvVar[],
  runtimePorts: RuntimeAssignedPort[] = []
): ProfileEnvVar[] {
  const used = collectUsedPorts(profiles, editingIdx, runtimePorts)
  const slug = profileName.trim() || 'profile'
  const portOffset = Math.abs(hashString(slug)) % 50
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
    const preferred = (baseEntry?.base ?? port) + portOffset
    const free = nextFreePort(preferred, used)
    used.add(free)

    if (ev.key.toUpperCase() === 'DATABASE_URL') {
      result.push({ key: ev.key, value: buildDatabaseUrl(template, free) })
    } else {
      result.push({ key: ev.key, value: String(free) })
    }
  }

  return syncDatabaseUrlWithPostgres(result, template)
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
