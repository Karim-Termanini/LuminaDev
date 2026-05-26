import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Locale, translations } from './translations'

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: keyof typeof translations['en-US']) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en-US')

  useEffect(() => {
    void window.dh.storeGet({ key: 'language_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        const stored = (res.data as Record<string, unknown>).locale as Locale
        if (stored === 'en-US' || stored === 'ar-SA') {
          setLocale(stored)
        }
      }
    })
  }, [])

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
    document.documentElement.lang = newLocale.split('-')[0]
    document.documentElement.dir = newLocale === 'ar-SA' ? 'rtl' : 'ltr'
    if (newLocale === 'ar-SA') {
        document.documentElement.classList.add('hp-rtl')
    } else {
        document.documentElement.classList.remove('hp-rtl')
    }
  }

  const t = (key: keyof typeof translations['en-US']) => {
    return translations[locale][key] || translations['en-US'][key] || key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useTranslation must be used within I18nProvider')
  return context
}
