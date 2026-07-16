import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { enResource } from './translations/en.js'
import { zhResource } from './translations/zh.js'

export const resources = {
  en: enResource,
  zh: zhResource,
} as const

export const defaultLanguage = 'zh'

void i18n.use(initReactI18next).init({
  fallbackLng: defaultLanguage,
  interpolation: { escapeValue: false },
  lng: defaultLanguage,
  resources,
})

export default i18n
