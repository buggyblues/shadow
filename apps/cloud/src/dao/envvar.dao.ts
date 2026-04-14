/**
 * DAO — Environment variable data access with encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type EnvVar, envVars } from '../db/schema.js'
import { normalizeGroupName, withLegacyEnvAliases } from '../utils/env-names.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH)
}

export class EnvVarDao {
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

  findByScope(scope: string): Array<{ key: string; value: string; isSecret: boolean }> {
    const rows = this.db.select().from(envVars).where(eq(envVars.scope, scope)).all()
    return rows.map((r) => ({
      key: r.key,
      value: this.decrypt(r.encryptedValue, r.iv),
      isSecret: r.isSecret ?? true,
    }))
  }

  findOne(
    scope: string,
    key: string,
  ): {
    scope: string
    key: string
    value: string
    isSecret: boolean
    groupName: string
  } | null {
    const row = this.db
      .select()
      .from(envVars)
      .where(and(eq(envVars.scope, scope), eq(envVars.key, key)))
      .get()

    if (!row) {
      return null
    }

    return {
      scope: row.scope,
      key: row.key,
      value: this.decrypt(row.encryptedValue, row.iv),
      isSecret: row.isSecret ?? true,
      groupName: normalizeGroupName(row.groupName),
    }
  }

  findAllMasked(): Array<{
    scope: string
    key: string
    maskedValue: string
    isSecret: boolean
    groupName: string
  }> {
    const rows = this.db.select().from(envVars).all()
    return rows.map((r) => {
      const val = this.decrypt(r.encryptedValue, r.iv)
      return {
        scope: r.scope,
        key: r.key,
        maskedValue: r.isSecret
          ? val.length > 8
            ? `${val.slice(0, 4)}${'•'.repeat(Math.min(val.length - 8, 20))}${val.slice(-4)}`
            : '••••••••'
          : val,
        isSecret: r.isSecret ?? true,
        groupName: normalizeGroupName(r.groupName),
      }
    })
  }

  findMaskedByScope(scope: string): Array<{
    scope: string
    key: string
    maskedValue: string
    isSecret: boolean
    groupName: string
  }> {
    return this.findAllMasked().filter((entry) => entry.scope === scope)
  }

  findAllMaskedByScopes(scopes: string[]): Array<{
    scope: string
    key: string
    maskedValue: string
    isSecret: boolean
    groupName: string
  }> {
    const scopedEntries = this.findAllMasked().filter((entry) => scopes.includes(entry.scope))
    const merged = new Map<string, (typeof scopedEntries)[number]>()

    for (const scope of scopes) {
      for (const entry of scopedEntries.filter((item) => item.scope === scope)) {
        merged.set(entry.key, entry)
      }
    }

    return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key))
  }

  upsert(
    scope: string,
    key: string,
    value: string,
    isSecret = true,
    groupName = 'default',
  ): EnvVar {
    const existing = this.db
      .select()
      .from(envVars)
      .where(and(eq(envVars.scope, scope), eq(envVars.key, key)))
      .get()

    const { encrypted, iv } = this.encrypt(value)

    if (existing) {
      return this.db
        .update(envVars)
        .set({
          encryptedValue: encrypted,
          iv,
          isSecret,
          groupName: normalizeGroupName(groupName),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(envVars.id, existing.id))
        .returning()
        .get()
    }

    return this.db
      .insert(envVars)
      .values({
        scope,
        key,
        encryptedValue: encrypted,
        iv,
        isSecret,
        groupName: normalizeGroupName(groupName),
      })
      .returning()
      .get()
  }

  delete(scope: string, key: string): void {
    this.db
      .delete(envVars)
      .where(and(eq(envVars.scope, scope), eq(envVars.key, key)))
      .run()
  }

  getValue(scope: string, key: string): string | null {
    const row = this.db
      .select()
      .from(envVars)
      .where(and(eq(envVars.scope, scope), eq(envVars.key, key)))
      .get()
    if (!row) return null
    return this.decrypt(row.encryptedValue, row.iv)
  }

  /** Return all env vars (decrypted) as a flat key→value map for deploy resolution. */
  findAllDecrypted(): Record<string, string> {
    const rows = this.db.select().from(envVars).all()
    const result: Record<string, string> = {}
    for (const r of rows) {
      Object.assign(result, withLegacyEnvAliases(r.key, this.decrypt(r.encryptedValue, r.iv)))
    }
    return result
  }

  findAllDecryptedByScopes(scopes: string[]): Record<string, string> {
    const rows = this.db.select().from(envVars).all()
    const result: Record<string, string> = {}

    for (const scope of scopes) {
      for (const row of rows.filter((entry) => entry.scope === scope)) {
        Object.assign(
          result,
          withLegacyEnvAliases(row.key, this.decrypt(row.encryptedValue, row.iv)),
        )
      }
    }

    return result
  }
}
