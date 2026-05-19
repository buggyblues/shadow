type CompressImageOptions = {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: 'image/jpeg' | 'image/webp'
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('IMAGE_COMPRESSION_FAILED'))
      },
      mimeType,
      quality,
    )
  })
}

export async function compressImageForUpload(
  file: File,
  {
    maxWidth = 1600,
    maxHeight = 1067,
    quality = 0.82,
    mimeType = 'image/jpeg',
  }: CompressImageOptions = {},
) {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  try {
    const ratio = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, mimeType, quality)
    if (blob.size >= file.size) return file
    const extension = mimeType === 'image/webp' ? 'webp' : 'jpg'
    const name = file.name.replace(/\.[^.]+$/u, '') || 'image'
    return new File([blob], `${name}.${extension}`, { type: mimeType, lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
