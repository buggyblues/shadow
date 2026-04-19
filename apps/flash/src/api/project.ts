import type { ApiResponse } from './base'
import { BASE } from './base'

export async function loadProject(): Promise<ApiResponse<unknown>> {
  const res = await fetch(`${BASE}/project`)
  return res.json()
}

export async function loadProjectFull(): Promise<ApiResponse<unknown>> {
  const res = await fetch(`${BASE}/project?hydrate=full`)
  return res.json()
}

export async function saveProject(state: Record<string, unknown>): Promise<ApiResponse> {
  // Strip task logs client-side to reduce upload payload
  const project = state.project as Record<string, unknown> | undefined
  let stripped = state
  if (project?.tasks && Array.isArray(project.tasks)) {
    const lightTasks = (project.tasks as Array<Record<string, unknown>>).map((t) => {
      const { logs, ...rest } = t
      return { ...rest, logsCount: Array.isArray(logs) ? logs.length : t.logsCount || 0 }
    })
    stripped = {
      ...state,
      project: { ...project, tasks: lightTasks },
    }
  }
  const res = await fetch(`${BASE}/project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stripped),
  })
  return res.json()
}

export async function resetProject(): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/project`, { method: 'DELETE' })
  return res.json()
}
