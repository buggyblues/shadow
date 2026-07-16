import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import i18n from '../config/i18n.js'

export type TravelLanguage = 'en' | 'zh'
export type TemperatureUnit = 'celsius' | 'fahrenheit'
export type DistanceUnit = 'metric' | 'imperial'
export type CurrencyPreference = 'EUR' | 'USD' | 'CNY' | 'JPY' | 'GBP' | 'SGD'

interface TravelPreferences {
  currency: CurrencyPreference
  language: TravelLanguage
  temperatureUnit: TemperatureUnit
  distanceUnit: DistanceUnit
}

interface TravelPreferencesContextValue extends TravelPreferences {
  setCurrency: (currency: CurrencyPreference) => void
  setLanguage: (language: TravelLanguage) => void
  setTemperatureUnit: (unit: TemperatureUnit) => void
  setDistanceUnit: (unit: DistanceUnit) => void
}

const defaultPreferences: TravelPreferences = {
  currency: 'EUR',
  distanceUnit: 'metric',
  language: 'zh',
  temperatureUnit: 'celsius',
}

const storageKey = 'travel.preferences.v2'
const TravelPreferencesContext = createContext<TravelPreferencesContextValue | null>(null)

function readPreferences(): TravelPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaultPreferences
    const parsed = JSON.parse(raw) as Partial<TravelPreferences>
    const currencies: CurrencyPreference[] = ['EUR', 'USD', 'CNY', 'JPY', 'GBP', 'SGD']
    const currency = currencies.includes(parsed.currency as CurrencyPreference)
      ? (parsed.currency as CurrencyPreference)
      : defaultPreferences.currency
    return {
      currency,
      distanceUnit: parsed.distanceUnit === 'imperial' ? 'imperial' : 'metric',
      language: parsed.language === 'zh' ? 'zh' : 'en',
      temperatureUnit: parsed.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    }
  } catch {
    return defaultPreferences
  }
}

export function TravelPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<TravelPreferences>(() => readPreferences())

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences))
    void i18n.changeLanguage(preferences.language)
  }, [preferences])

  const value = useMemo<TravelPreferencesContextValue>(
    () => ({
      ...preferences,
      setCurrency: (currency) => setPreferences((current) => ({ ...current, currency })),
      setDistanceUnit: (distanceUnit) =>
        setPreferences((current) => ({ ...current, distanceUnit })),
      setLanguage: (language) => setPreferences((current) => ({ ...current, language })),
      setTemperatureUnit: (temperatureUnit) =>
        setPreferences((current) => ({ ...current, temperatureUnit })),
    }),
    [preferences],
  )

  return (
    <TravelPreferencesContext.Provider value={value}>{children}</TravelPreferencesContext.Provider>
  )
}

export function useTravelPreferences() {
  const context = useContext(TravelPreferencesContext)
  if (!context)
    throw new Error('useTravelPreferences must be used inside TravelPreferencesProvider')
  return context
}
