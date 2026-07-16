import { apiGet } from '../../../services/api-client.js'

export interface TravelAirQualityPoint {
  time: string
  aqi?: number
  pm10?: number
  pm2_5?: number
  carbon_monoxide?: number
  nitrogen_dioxide?: number
  ozone?: number
}

export interface TravelWeatherHour {
  time: string
  temp?: number
  precipitation?: number
  precipitation_probability?: number
  wind?: number
  humidity?: number
  main?: string
  air_quality?: TravelAirQualityPoint
}

export interface TravelWeather {
  provider?: string
  type?: 'current' | 'forecast' | 'archive' | 'climate' | string
  date?: string
  timezone?: string
  temp?: number
  temp_max?: number
  temp_min?: number
  main?: string
  description?: string
  precipitation_sum?: number
  precipitation_probability_max?: number
  wind_max?: number
  sunrise?: string
  sunset?: string
  air_quality?: {
    provider?: string
    aqi?: number
    pm10?: number
    pm2_5?: number
    carbon_monoxide?: number
    nitrogen_dioxide?: number
    ozone?: number
  }
  hourly?: TravelWeatherHour[]
}

export async function fetchTravelWeather(input: {
  date: string
  latitude: number
  longitude: number
  detailed?: boolean
}) {
  return apiGet<TravelWeather | null>('/api/providers/weather', {
    date: input.date,
    detailed: input.detailed,
    lat: input.latitude,
    lng: input.longitude,
  })
}
