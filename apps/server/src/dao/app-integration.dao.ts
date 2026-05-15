import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  type ServerAppManifest,
  serverAppBuddyGrants,
  serverAppCatalogEntries,
  serverAppIntegrations,
} from '../db/schema'

export class AppIntegrationDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async listByServer(serverId: string) {
    return this.db
      .select()
      .from(serverAppIntegrations)
      .where(eq(serverAppIntegrations.serverId, serverId))
      .orderBy(serverAppIntegrations.name)
  }

  async findById(id: string) {
    const rows = await this.db
      .select()
      .from(serverAppIntegrations)
      .where(eq(serverAppIntegrations.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findByServerAndKey(serverId: string, appKey: string) {
    const rows = await this.db
      .select()
      .from(serverAppIntegrations)
      .where(
        and(eq(serverAppIntegrations.serverId, serverId), eq(serverAppIntegrations.appKey, appKey)),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(data: {
    serverId: string
    appKey: string
    name: string
    description?: string | null
    iconUrl?: string | null
    manifestUrl?: string | null
    manifest: ServerAppManifest
    iframeEntry?: string | null
    allowedOrigins: string[]
    apiBaseUrl: string
    sharedSecretEncrypted?: string | null
    installedByUserId: string
  }) {
    const rows = await this.db
      .insert(serverAppIntegrations)
      .values({
        serverId: data.serverId,
        appKey: data.appKey,
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        manifestUrl: data.manifestUrl ?? null,
        manifest: data.manifest,
        iframeEntry: data.iframeEntry ?? null,
        allowedOrigins: data.allowedOrigins,
        apiBaseUrl: data.apiBaseUrl,
        sharedSecretEncrypted: data.sharedSecretEncrypted ?? null,
        installedByUserId: data.installedByUserId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [serverAppIntegrations.serverId, serverAppIntegrations.appKey],
        set: {
          name: data.name,
          description: data.description ?? null,
          iconUrl: data.iconUrl ?? null,
          manifestUrl: data.manifestUrl ?? null,
          manifest: data.manifest,
          iframeEntry: data.iframeEntry ?? null,
          allowedOrigins: data.allowedOrigins,
          apiBaseUrl: data.apiBaseUrl,
          sharedSecretEncrypted: data.sharedSecretEncrypted ?? null,
          status: 'active',
          installedByUserId: data.installedByUserId,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async deleteByServerAndKey(serverId: string, appKey: string) {
    await this.db
      .delete(serverAppIntegrations)
      .where(
        and(eq(serverAppIntegrations.serverId, serverId), eq(serverAppIntegrations.appKey, appKey)),
      )
  }

  async deleteById(id: string) {
    await this.db.delete(serverAppIntegrations).where(eq(serverAppIntegrations.id, id))
  }

  async listCatalogEntries(options: { includeInactive?: boolean } = {}) {
    if (options.includeInactive) {
      return this.db.select().from(serverAppCatalogEntries).orderBy(serverAppCatalogEntries.name)
    }
    return this.db
      .select()
      .from(serverAppCatalogEntries)
      .where(eq(serverAppCatalogEntries.status, 'active'))
      .orderBy(serverAppCatalogEntries.name)
  }

  async findCatalogEntryById(id: string) {
    const rows = await this.db
      .select()
      .from(serverAppCatalogEntries)
      .where(eq(serverAppCatalogEntries.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findCatalogEntryByAppKey(appKey: string) {
    const rows = await this.db
      .select()
      .from(serverAppCatalogEntries)
      .where(eq(serverAppCatalogEntries.appKey, appKey))
      .limit(1)
    return rows[0] ?? null
  }

  async upsertCatalogEntry(data: {
    appKey: string
    name: string
    description?: string | null
    iconUrl?: string | null
    manifestUrl?: string | null
    manifest: ServerAppManifest
    sharedSecretEncrypted?: string | null
    status?: string
    createdByUserId?: string | null
  }) {
    const rows = await this.db
      .insert(serverAppCatalogEntries)
      .values({
        appKey: data.appKey,
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        manifestUrl: data.manifestUrl ?? null,
        manifest: data.manifest,
        sharedSecretEncrypted: data.sharedSecretEncrypted ?? null,
        status: data.status ?? 'active',
        createdByUserId: data.createdByUserId ?? null,
      })
      .onConflictDoUpdate({
        target: serverAppCatalogEntries.appKey,
        set: {
          name: data.name,
          description: data.description ?? null,
          iconUrl: data.iconUrl ?? null,
          manifestUrl: data.manifestUrl ?? null,
          manifest: data.manifest,
          sharedSecretEncrypted: data.sharedSecretEncrypted ?? null,
          status: data.status ?? 'active',
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async deleteCatalogEntryById(id: string) {
    await this.db.delete(serverAppCatalogEntries).where(eq(serverAppCatalogEntries.id, id))
  }

  async upsertBuddyGrant(data: {
    serverAppId: string
    buddyAgentId: string
    permissions: string[]
    resourceRules?: Record<string, unknown>
    approvalMode?: string
    createdByUserId: string
    expiresAt?: Date | null
  }) {
    const rows = await this.db
      .insert(serverAppBuddyGrants)
      .values({
        serverAppId: data.serverAppId,
        buddyAgentId: data.buddyAgentId,
        permissions: data.permissions,
        resourceRules: data.resourceRules ?? {},
        approvalMode: data.approvalMode ?? 'none',
        createdByUserId: data.createdByUserId,
        expiresAt: data.expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: [serverAppBuddyGrants.serverAppId, serverAppBuddyGrants.buddyAgentId],
        set: {
          permissions: data.permissions,
          resourceRules: data.resourceRules ?? {},
          approvalMode: data.approvalMode ?? 'none',
          expiresAt: data.expiresAt ?? null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async findBuddyGrant(serverAppId: string, buddyAgentId: string) {
    const rows = await this.db
      .select()
      .from(serverAppBuddyGrants)
      .where(
        and(
          eq(serverAppBuddyGrants.serverAppId, serverAppId),
          eq(serverAppBuddyGrants.buddyAgentId, buddyAgentId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async listBuddyGrants(serverAppId: string) {
    return this.db
      .select()
      .from(serverAppBuddyGrants)
      .where(eq(serverAppBuddyGrants.serverAppId, serverAppId))
      .orderBy(serverAppBuddyGrants.createdAt)
  }
}
