import type { ApiResponse } from './base'
import { BASE } from './base'

export async function getTaskLogs(
  taskId: string,
): Promise<ApiResponse<{ logs: string[]; count: number }>> {
  const res = await fetch(`${BASE}/tasks/${taskId}/logs`)
  return res.json()
}

export async function appendTaskLogs(taskId: string, logs: string[]): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/tasks/${taskId}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs }),
  })
  return res.json()
}

export async function clearTaskLogs(taskId: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/tasks/${taskId}/logs`, { method: 'DELETE' })
  return res.json()
}

export async function abortTask(requestId: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/abort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })
  return res.json()
}

export async function getActiveRequests(): Promise<ApiResponse<string[]>> {
  const res = await fetch(`${BASE}/abort/active`)
  return res.json()
}
