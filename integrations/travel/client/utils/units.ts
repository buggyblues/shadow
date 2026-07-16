import type { DistanceUnit, TemperatureUnit } from '../store/preferences.js'

export function formatTemperature(value: number | undefined, unit: TemperatureUnit) {
  if (!Number.isFinite(value)) return '—'
  const celsius = Math.round(value!)
  if (unit === 'fahrenheit') return `${Math.round((celsius * 9) / 5 + 32)}°F`
  return `${celsius}°C`
}

export function formatDistance(kilometers: number | undefined, unit: DistanceUnit) {
  if (!Number.isFinite(kilometers)) return undefined
  if (unit === 'imperial') {
    const miles = kilometers! * 0.621371
    return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${roundOne(miles)} mi`
  }
  return kilometers! < 1 ? `${Math.round(kilometers! * 1000)} m` : `${roundOne(kilometers!)} km`
}

export function formatWindSpeed(kilometersPerHour: number | undefined, unit: DistanceUnit) {
  if (!Number.isFinite(kilometersPerHour)) return '—'
  if (unit === 'imperial') return `${Math.round(kilometersPerHour! * 0.621371)} mph`
  return `${Math.round(kilometersPerHour!)} km/h`
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10
}
