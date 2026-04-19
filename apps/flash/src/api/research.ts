import type { ApiResponse } from './base'
import { BASE } from './base'

export async function getResearchProgress(projectId: string): Promise<
  ApiResponse<{
    completedTopics: { key: string; topic: string; completedAt: number }[]
    lastResearchAt: number
  }>
> {
  const res = await fetch(`${BASE}/research/progress?projectId=${encodeURIComponent(projectId)}`)
  return res.json()
}

export async function updateResearchProgress(
  projectId: string,
  progress: Record<string, unknown>,
): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/research/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...progress }),
  })
  return res.json()
}

export async function checkResearchDuplicate(
  projectId: string,
  topic: string,
  materialIds: string[],
): Promise<ApiResponse<{ isDuplicate: boolean; key: string }>> {
  const res = await fetch(`${BASE}/research/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, topic, materialIds }),
  })
  return res.json()
}
