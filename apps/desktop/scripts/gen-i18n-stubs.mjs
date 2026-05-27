import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/renderer/src/i18n/locales')

const LOCALES = ['en-US', 'de-DE', 'ar-SA']
const NAMESPACES = [
  'common', 'nav', 'dashboard', 'docker', 'git', 'ssh',
  'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
]

for (const locale of LOCALES) {
  for (const ns of NAMESPACES) {
    const dir = join(localesDir, locale)
    const file = join(dir, `${ns}.json`)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (!existsSync(file)) {
      writeFileSync(file, '{}\n', 'utf8')
      console.log(`created ${locale}/${ns}.json`)
    } else {
      console.log(`skip   ${locale}/${ns}.json (exists)`)
    }
  }
}
