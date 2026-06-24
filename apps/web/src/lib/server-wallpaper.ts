import type { WorkspaceNode } from '../stores/workspace.store'
import { fetchApi } from './api'

export type ServerWallpaperType = 'image' | 'html'

export function inferServerWallpaperType(input: {
  ext?: string | null
  mime?: string | null
  name?: string | null
  type?: string | null
}): ServerWallpaperType | null {
  const mime = (input.mime ?? input.type ?? '').toLowerCase()
  const extFromName = input.name?.includes('.') ? `.${input.name.split('.').pop()}` : ''
  const ext = (input.ext ?? extFromName).toLowerCase()

  if (
    mime.startsWith('image/') ||
    ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(ext)
  ) {
    return 'image'
  }
  if (mime.includes('html') || ext === '.html' || ext === '.htm') return 'html'
  return null
}

export function isWorkspaceWallpaperFile(node: WorkspaceNode | null | undefined) {
  return Boolean(node && node.kind === 'file' && inferServerWallpaperType(node))
}

export async function setServerWallpaperFromWorkspaceFile(
  serverId: string,
  node: WorkspaceNode,
  options?: { interactive?: boolean },
) {
  const wallpaperType = inferServerWallpaperType(node)
  if (node.kind !== 'file' || !wallpaperType) {
    throw new Error('UNSUPPORTED_WALLPAPER_FILE')
  }

  await fetchApi(`/api/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      wallpaperType,
      wallpaperWorkspaceFileId: node.id,
      wallpaperInteractive: wallpaperType === 'html' ? Boolean(options?.interactive) : false,
    }),
  })

  return wallpaperType
}
