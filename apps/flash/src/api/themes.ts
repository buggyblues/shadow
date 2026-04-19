import type { ApiResponse, SdkThemeDetail, SdkThemeItem } from './base'
import { BASE } from './base'

export async function searchThemes(
  query?: string,
  category?: string,
  limit?: number,
): Promise<ApiResponse<SdkThemeItem[]> & { total?: number }> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (category) params.set('category', category)
  if (limit) params.set('limit', String(limit))
  const res = await fetch(`${BASE}/themes?${params}`)
  return res.json()
}

export async function getThemeDetail(themeId: string): Promise<ApiResponse<SdkThemeDetail>> {
  const res = await fetch(`${BASE}/themes/${themeId}`)
  return res.json()
}

export async function getThemeComponents(
  themeId: string,
): Promise<ApiResponse<{ id: string; name: string; notes: string; jsxCode: string }[]>> {
  const res = await fetch(`${BASE}/themes/${themeId}/components`)
  return res.json()
}
