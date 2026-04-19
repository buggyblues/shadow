import type { ApiResponse, Material } from './base'
import { BASE } from './base'

export async function uploadMaterials(
  projectId: string,
  files: File[],
): Promise<ApiResponse<Material[]>> {
  const form = new FormData()
  form.append('projectId', projectId)
  for (const f of files) form.append('files', f)
  const res = await fetch(`${BASE}/materials/upload`, { method: 'POST', body: form })
  return res.json()
}

export async function addTextMaterial(
  projectId: string,
  content: string,
  name: string,
  type: string,
): Promise<ApiResponse<Material>> {
  const res = await fetch(`${BASE}/materials/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, content, name, type }),
  })
  return res.json()
}

export function getMaterialDownloadUrl(materialId: string): string {
  return `${BASE}/materials/${materialId}/download`
}
