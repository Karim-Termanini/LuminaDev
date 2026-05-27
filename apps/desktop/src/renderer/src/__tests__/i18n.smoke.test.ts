import { describe, it, expect } from 'vitest'

const NAMESPACES = [
  'common', 'nav', 'dashboard', 'docker', 'git', 'ssh',
  'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
] as const

const enModules = import.meta.glob('../i18n/locales/en-US/*.json', { eager: true })
const deModules = import.meta.glob('../i18n/locales/de-DE/*.json', { eager: true })
const arModules = import.meta.glob('../i18n/locales/ar-SA/*.json', { eager: true })

function load(modules: Record<string, unknown>, ns: string): Record<string, string> {
  const key = Object.keys(modules).find((k) => k.endsWith(`/${ns}.json`))
  return (key ? (modules[key] as { default?: Record<string, string> }).default ?? modules[key] : {}) as Record<string, string>
}

describe('i18n smoke', () => {
  for (const ns of NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      it('de-DE has all en-US keys', () => {
        const en = load(enModules, ns)
        const de = load(deModules, ns)
        for (const key of Object.keys(en)) {
          expect(de[key], `de-DE missing key "${key}" in ${ns}`).toBeDefined()
        }
      })

      it('ar-SA has all en-US keys and values differ from key string', () => {
        const en = load(enModules, ns)
        const ar = load(arModules, ns)
        for (const key of Object.keys(en)) {
          expect(ar[key], `ar-SA missing key "${key}" in ${ns}`).toBeDefined()
          expect(ar[key], `ar-SA key "${key}" in ${ns} has raw key as value`).not.toBe(key)
        }
      })
    })
  }
})
