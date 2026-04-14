/**
 * DAO — Secret / provider key data access with encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type Secret, secrets } from '../db/schema.js'
import {
  normalizeGroupName,
  toProviderSecretEnvKey,
  withLegacyEnvAliases,
} from '../utils/env-names.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH)
}

export class SecretDao {
  private passphrase: string

  constructor(
    private db: CloudDatabase,
    passphrase?: string,
  ) {
    this.passphrase = passphrase ?? process.env.SHADOWOB_PASSPHRASE ?? 'shadowob-cloud-default'
  }

  private encrypt(plaintext: string): { encrypted: string; iv: string } {
    const salt = randomBytes(16)
    const key = deriveKey(this.passphrase, salt)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    // Store salt + authTag + ciphertext together
    return {
      encrypted: salt.toString('hex') + authTag.toString('hex') + encrypted,
      iv: iv.toString('hex'),
    }
  }

  private decrypt(encryptedHex: string, ivHex: string): string {
    const salt = Buffer.from(encryptedHex.slice(0, 32), 'hex')
    const authTag = Buffer.from(encryptedHex.slice(32, 32 + AUTH_TAG_LENGTH * 2), 'hex')
    const ciphertext = encryptedHex.slice(32 + AUTH_TAG_LENGTH * 2)
    const key = deriveKey(this.passphrase, salt)
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(ciphertext, 'hex', 'utf-8')
    decrypted += decipher.final('utf-8')
    return decrypted
  }

  findByProvider(providerId: string): Array<{ key: string; value: string }> {
    const rows = this.db.select().from(secrets).where(eq(secrets.providerId, providerId)).all()
    return rows.map((r) => ({
      key: r.key,
      value: this.decrypt(r.encryptedValue, r.iv),
    }))
  }

  findAll(): Array<{ providerId: string; key: string; maskedValue: string; groupName: string }> {
    const rows = this.db.select().from(secrets).all()
    return rows.map((r) => {
      const val = this.decrypt(r.encryptedValue, r.iv)
      return {
        providerId: r.providerId,
        key: r.key,
        maskedValue:
          val.length > 8
            ? `${val.slice(0, 4)}${'•'.repeat(val.length - 8)}${val.slice(-4)}`
            : '••••••••',
        groupName: normalizeGroupName(r.groupName),
      }
    })
  }

  findAllDecryptedEntries(): Array<{
    providerId: string
    key: string
    value: string
    groupName: string
  }> {
    const rows = this.db.select().from(secrets).all()
    return rows.map((row) => ({
      providerId: row.providerId,
      key: row.key,
      value: this.decrypt(row.encryptedValue, row.iv),
      groupName: normalizeGroupName(row.groupName),
    }))
  }

  findByGroup(groupName: string): Array<{ providerId: string; key: string; maskedValue: string }> {
    const rows = this.db.select().from(secrets).where(eq(secrets.groupName, groupName)).all()
    return rows.map((r) => {
      const val = this.decrypt(r.encryptedValue, r.iv)
      return {
        providerId: r.providerId,
        key: r.key,
        maskedValue:
          val.length > 8
            ? `${val.slice(0, 4)}${'•'.repeat(val.length - 8)}${val.slice(-4)}`
            : '••••••••',
      }
    })
  }

  upsert(providerId: string, key: string, value: string, groupName = 'default'): Secret {
    const existing = this.db
      .select()
      .from(secrets)
      .where(and(eq(secrets.providerId, providerId), eq(secrets.key, key)))
      .get()

    const { encrypted, iv } = this.encrypt(value)

    if (existing) {
      return this.db
        .update(secrets)
        .set({
          encryptedValue: encrypted,
          iv,
          groupName: normalizeGroupName(groupName),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(secrets.id, existing.id))
        .returning()
        .get()
    }

    return this.db
      .insert(secrets)
      .values({
        providerId,
        key,
        encryptedValue: encrypted,
        iv,
        groupName: normalizeGroupName(groupName),
      })
      .returning()
      .get()
  }

  delete(providerId: string, key: string): void {
    this.db
      .delete(secrets)
      .where(and(eq(secrets.providerId, providerId), eq(secrets.key, key)))
      .run()
  }

  deleteProvider(providerId: string): void {
    this.db.delete(secrets).where(eq(secrets.providerId, providerId)).run()
  }

  deleteAll(): void {
    this.db.delete(secrets).run()
  }

  /** Get decrypted value for a provider key — used internally by deploy flow. */
  getValue(providerId: string, key: string): string | null {
    const row = this.db
      .select()
      .from(secrets)
      .where(and(eq(secrets.providerId, providerId), eq(secrets.key, key)))
      .get()
    if (!row) return null
    return this.decrypt(row.encryptedValue, row.iv)
  }

  /** Return all secrets (decrypted) mapped to env var names for deploy resolution. */
  findAllDecrypted(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const entry of this.findAllDecryptedEntries()) {
      Object.assign(
        result,
        withLegacyEnvAliases(toProviderSecretEnvKey(entry.providerId, entry.key), entry.value),
      )
    }
    return result
  }
}
