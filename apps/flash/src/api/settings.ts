import type { ApiResponse } from './base'
import { BASE } from './base'

export async function loadSettings(): Promise<
  ApiResponse<{ userSettings: Record<string, unknown> }>
> {
  const res = await fetch(`${BASE}/settings`)
  return res.json()
}

export async function saveSettings(settings: { userSettings: unknown }): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return res.json()
}
