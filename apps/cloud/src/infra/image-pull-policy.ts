export type ImagePullPolicy = 'Always' | 'IfNotPresent' | 'Never'

export function resolveImagePullPolicy(
  explicit: ImagePullPolicy | undefined,
  image: string | undefined,
): ImagePullPolicy {
  return explicit ?? defaultImagePullPolicy(image)
}

function defaultImagePullPolicy(image: string | undefined): ImagePullPolicy {
  if (!image) return 'IfNotPresent'
  if (image.includes('@sha256:')) return 'IfNotPresent'

  const tag = imageTag(image)
  if (tag && tag !== 'latest') return 'IfNotPresent'
  if (isLocalImage(image)) return 'IfNotPresent'
  return 'Always'
}

function imageTag(image: string): string | undefined {
  const withoutDigest = image.split('@', 1)[0] ?? image
  const lastSlash = withoutDigest.lastIndexOf('/')
  const name = withoutDigest.slice(lastSlash + 1)
  const tagSeparator = name.lastIndexOf(':')
  return tagSeparator >= 0 ? name.slice(tagSeparator + 1) : undefined
}

function isLocalImage(image: string): boolean {
  const normalized = image.toLowerCase()
  return (
    normalized.startsWith('localhost/') ||
    normalized.startsWith('localhost:') ||
    normalized.startsWith('127.0.0.1/') ||
    normalized.startsWith('127.0.0.1:') ||
    normalized.startsWith('shadowob/') ||
    normalized.includes(':local') ||
    normalized.endsWith('-local')
  )
}
