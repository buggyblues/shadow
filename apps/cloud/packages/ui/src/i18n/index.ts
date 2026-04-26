import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zhCN from './zh-CN.json'

// Cloud-UI can be mounted stand-alone (apps/cloud/dashboard) OR embedded in a
// host SPA (apps/web) that already initialized i18next. In the embedded case
// we MUST NOT call i18n.init() again — it would wipe the host's translations.
// Instead we add our resources as an extra bundle on the existing instance.
if (i18n.isInitialized) {
  i18n.addResourceBundle('en', 'translation', en, true, false)
  i18n.addResourceBundle('zh-CN', 'translation', zhCN, true, false)
} else {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        'zh-CN': { translation: zhCN },
      },
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'shadow-cloud-lang',
      },
    })
}

export default i18n
