import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function keyMaterial() {
  const configured =
    process.env.TRAVEL_ENCRYPTION_KEY ??
    process.env.TRAVEL_SECRET_KEY ??
    process.env.SHADOW_SPACE_APP_SECRET ??
    'travel-local-development-secret'
  return createHash('sha256').update(configured).digest()
}

export function encryptSecret(value: string) {
  if (!value) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`
}

export function decryptSecret(value: string | undefined | null) {
  if (!value) return ''
  if (!value.startsWith(PREFIX)) return value
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64url')
  if (raw.length < 29) return ''
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

export function maskSecret(value: string | undefined | null) {
  return value ? '********' : ''
}
