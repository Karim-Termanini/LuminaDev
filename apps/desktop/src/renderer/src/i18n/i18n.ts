import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

i18n
  .use(
    resourcesToBackend(
      (lang: string, ns: string) => import(`./locales/${lang}/${ns}.json`)
    )
  )
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-US',
    defaultNS: 'common',
    ns: [
      'common', 'nav', 'dashboard', 'docker', 'git', 'cloudGit', 'ssh',
      'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
    ],
    interpolation: { escapeValue: false },
    missingKeyHandler: import.meta.env.DEV
      ? (_lngs: readonly string[], ns: string, key: string) =>
          console.error(`[i18n] Missing key: ${ns}:${key}`)
      : undefined,
  })

export default i18n
