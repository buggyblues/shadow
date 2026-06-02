export type ShadowThemePreference = 'dark' | 'light' | 'system'
export type RspressThemePreference = 'dark' | 'light' | 'auto'

export const SHADOW_LANGUAGE_STORAGE_KEY = 'shadow-lang'
export const SHADOW_THEME_STORAGE_KEY = 'shadow-theme'
export const RSPRESS_THEME_APPEARANCE_KEY = 'rspress-theme-appearance'

function isShadowThemePreference(value: unknown): value is ShadowThemePreference {
  return value === 'dark' || value === 'light' || value === 'system'
}

function isRspressThemePreference(value: unknown): value is RspressThemePreference {
  return value === 'dark' || value === 'light' || value === 'auto'
}

export function shadowToRspressTheme(theme: ShadowThemePreference): RspressThemePreference {
  return theme === 'system' ? 'auto' : theme
}

export function rspressToShadowTheme(theme: RspressThemePreference): ShadowThemePreference {
  return theme === 'auto' ? 'system' : theme
}

export function normalizeShadowThemePreference(
  value: unknown,
  fallback: ShadowThemePreference = 'dark',
): ShadowThemePreference {
  if (isShadowThemePreference(value)) return value
  if (isRspressThemePreference(value)) return rspressToShadowTheme(value)
  return fallback
}

export function readThemePreference(
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): ShadowThemePreference {
  if (!storage) return 'dark'
  const shadowTheme = storage.getItem(SHADOW_THEME_STORAGE_KEY)
  if (isShadowThemePreference(shadowTheme) || isRspressThemePreference(shadowTheme)) {
    return normalizeShadowThemePreference(shadowTheme)
  }
  return normalizeShadowThemePreference(storage.getItem(RSPRESS_THEME_APPEARANCE_KEY))
}

export function persistThemePreference(
  theme: ShadowThemePreference,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  if (!storage) return
  storage.setItem(SHADOW_THEME_STORAGE_KEY, theme)
  storage.setItem(RSPRESS_THEME_APPEARANCE_KEY, shadowToRspressTheme(theme))
}

export function effectiveThemePreference(
  theme: ShadowThemePreference,
  prefersDark = typeof window !== 'undefined'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
    : true,
): 'dark' | 'light' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

export function applyThemePreference(
  theme: ShadowThemePreference,
  root: HTMLElement | undefined = typeof document === 'undefined'
    ? undefined
    : document.documentElement,
): 'dark' | 'light' {
  const effective = effectiveThemePreference(theme)
  if (root) {
    root.classList.toggle('light', effective === 'light')
    root.classList.toggle('dark', effective === 'dark')
    root.style.colorScheme = effective
  }
  return effective
}

export function persistLanguagePreference(
  language: string,
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  const normalized = language.startsWith('zh') ? 'zh-CN' : language
  storage?.setItem(SHADOW_LANGUAGE_STORAGE_KEY, normalized)
}

export function websiteLanguagePreference(lang: 'zh' | 'en'): 'zh-CN' | 'en' {
  return lang === 'zh' ? 'zh-CN' : 'en'
}
