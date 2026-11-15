import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/common.json'
import de from './locales/de/common.json'

const STORAGE_KEY = 'taramisu.language'
export const i18n = createInstance()

function supportedLanguage(language: string) {
  const base = language.toLowerCase().split('-')[0]
  return base === 'en' || base === 'de' ? base : undefined
}

export function getInitialLanguage(): 'en' | 'de' {
  try {
    const saved = supportedLanguage(localStorage.getItem(STORAGE_KEY) ?? '')
    if (saved) return saved
  } catch {}
  for (const language of navigator.languages) {
    const supported = supportedLanguage(language)
    if (supported) return supported
  }
  return 'en'
}

i18n.use(initReactI18next).init({
  resources: { en: { common: en }, de: { common: de } },
  lng: getInitialLanguage(),
  supportedLngs: ['en', 'de'],
  fallbackLng: 'en',
  defaultNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = supportedLanguage(language) ?? 'en'
})

export function changeLanguage(language: string) {
  const supported = supportedLanguage(language)
  if (!supported) return
  void i18n.changeLanguage(supported)
  try {
    localStorage.setItem(STORAGE_KEY, supported)
  } catch {}
}
