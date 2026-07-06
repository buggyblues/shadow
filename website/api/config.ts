/**
 * Lightweight client-side config fetcher for RSPress website.
 * On build, falls back to hardcoded defaults; at runtime, fetches from API.
 */

const CONFIG_API_BASE =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, string>).__SHADOW_CONFIG_API_URL__ ?? '')
    : ''

export async function fetchConfig<T>(schemaName: string, fallback: T): Promise<T> {
  if (!CONFIG_API_BASE) return fallback
  try {
    const res = await fetch(`${CONFIG_API_BASE}/api/v1/config/${schemaName}?env=prod`, {
      next: { revalidate: 300 },
    } as RequestInit)
    if (!res.ok) return fallback
    const json = (await res.json()) as { data: T; version: number }
    return json.data as T
  } catch {
    return fallback
  }
}

export async function fetchFlags(): Promise<Record<string, boolean>> {
  if (!CONFIG_API_BASE) return {}
  try {
    const res = await fetch(`${CONFIG_API_BASE}/api/v1/config/flags?env=prod`)
    if (!res.ok) return {}
    return (await res.json()) as Record<string, boolean>
  } catch {
    return {}
  }
}
