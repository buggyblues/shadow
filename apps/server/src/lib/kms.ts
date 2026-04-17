/**
 * KMS abstraction for encrypting/decrypting sensitive values.
 *
 * In local/dev environments, falls back to AES-256-GCM using the KMS_MASTER_KEY env variable.
 * In production, can be extended to use AWS KMS, GCP KMS, or HashiCorp Vault by implementing
 * the KmsProvider interface and selecting it via the KMS_PROVIDER env variable.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // bytes
const IV_LENGTH = 12 // bytes (96-bit for GCM)
const AUTH_TAG_LENGTH = 16 // bytes

function getMasterKey(): Buffer {
  const keyEnv = process.env.KMS_MASTER_KEY
  if (!keyEnv) {
    throw new Error('KMS_MASTER_KEY environment variable is required for encryption')
  }
  const keyBuf = Buffer.from(keyEnv, 'hex')
  if (keyBuf.length !== KEY_LENGTH) {
    throw new Error('KMS_MASTER_KEY must be a 64-character hex string (32 bytes)')
  }
  return keyBuf
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string: iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * Decrypt a base64-encoded ciphertext produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getMasterKey()
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
