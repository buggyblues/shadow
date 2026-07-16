import { createHash, randomBytes, randomUUID } from 'node:crypto'

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

export function createPublicToken() {
  return randomBytes(24).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
