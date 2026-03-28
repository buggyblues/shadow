/**
 * Portfolio file utilities
 */

// File type categories for preview
export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'code'
  | 'archive'
  | 'model3d'
  | 'other'

export function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType.startsWith('application/vnd.') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('document') ||
    mimeType.includes('presentation')
  )
    return 'document'
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType.includes('javascript') ||
    mimeType.includes('typescript')
  )
    return 'code'
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-rar-compressed' ||
    mimeType === 'application/x-7z-compressed' ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip')
  )
    return 'archive'
  if (mimeType.startsWith('model/') || mimeType.includes('gltf') || mimeType.includes('obj'))
    return 'model3d'
  return 'other'
}

export function isPreviewable(mimeType: string): boolean {
  const category = getFileCategory(mimeType)
  return category !== 'other'
}
