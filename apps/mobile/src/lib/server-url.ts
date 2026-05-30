import * as SecureStore from 'expo-secure-store'

export const DEFAULT_API_BASE_URL = 'https://shadowob.com'

const SERVER_BASE_URL_KEY = 'serverBaseUrl'

export let API_BASE = DEFAULT_API_BASE_URL

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('empty')
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('invalid')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('invalidProtocol')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/$/, '')
}

export function getCachedApiBaseUrl(): string {
  return API_BASE
}

export async function getApiBaseUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SERVER_BASE_URL_KEY)
  if (!stored) {
    API_BASE = DEFAULT_API_BASE_URL
    return API_BASE
  }

  try {
    API_BASE = normalizeApiBaseUrl(stored)
  } catch {
    await SecureStore.deleteItemAsync(SERVER_BASE_URL_KEY)
    API_BASE = DEFAULT_API_BASE_URL
  }

  return API_BASE
}

export async function setApiBaseUrl(value: string): Promise<string> {
  const normalized = normalizeApiBaseUrl(value)
  await SecureStore.setItemAsync(SERVER_BASE_URL_KEY, normalized)
  API_BASE = normalized
  return normalized
}

export async function resetApiBaseUrl(): Promise<string> {
  await SecureStore.deleteItemAsync(SERVER_BASE_URL_KEY)
  API_BASE = DEFAULT_API_BASE_URL
  return API_BASE
}
