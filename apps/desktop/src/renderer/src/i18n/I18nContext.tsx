import { createContext, useContext, useEffect, type ReactNode } from 'react'
import i18n from './i18n'

interface I18nBridgeContextType {
  setLocale: (locale: string) => Promise<void>
}

const I18nBridgeContext = createContext<I18nBridgeContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void window.dh.storeGet({ key: 'language_settings' }).then((res) => {
      const data = res?.data as Record<string, unknown> | undefined
      const locale = (data?.locale as string | undefined) ?? 'en-US'
      void i18n.changeLanguage(locale)
      applyDomLocale(locale)
    })
  }, [])

  const setLocale = async (locale: string): Promise<void> => {
    void i18n.changeLanguage(locale)
    applyDomLocale(locale)
    await window.dh.storeSet({
      key: 'language_settings',
      data: { locale },
    })
  }

  return (
    <I18nBridgeContext.Provider value={{ setLocale }}>
      {children}
    </I18nBridgeContext.Provider>
  )
}

export function useI18nBridge(): I18nBridgeContextType {
  const ctx = useContext(I18nBridgeContext)
  if (!ctx) throw new Error('useI18nBridge must be used within I18nProvider')
  return ctx
}

function applyDomLocale(locale: string): void {
  document.documentElement.lang = locale.split('-')[0]
  if (locale === 'ar-SA') {
    document.documentElement.classList.add('hp-rtl')
  } else {
    document.documentElement.classList.remove('hp-rtl')
  }
}
