import { customAlphabet } from 'nanoid'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export const generateInviteCode = customAlphabet(alphabet, 8)

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export * from './avatar-generator'
export * from './cloud-computer-appearance'
export * from './cloud-computer-buddy'
export * from './cloud-connector-access'
export * from './message-commands'
export * from './message-mentions'
export * from './pixel-cats'
export * from './space-app-routes'
