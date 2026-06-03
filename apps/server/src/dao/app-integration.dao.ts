import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  type ServerAppManifest,
  serverAppBuddyGrants,
  serverAppCatalogEntries,
  serverAppCommandConsents,
  serverAppCommandTokens,
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

  async listSummariesByServer(serverId: string) {
    return this.db
      .select({
        id: serverAppIntegrations.id,
        serverId: serverAppIntegrations.serverId,
        appKey: serverAppIntegrations.appKey,
        name: serverAppIntegrations.name,
        iconUrl: serverAppIntegrations.iconUrl,
        status: serverAppIntegrations.status,
      })
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

  async findLatestByAppKey(appKey: string) {
    const rows = await this.db
      .select()
      .from(serverAppIntegrations)
      .where(eq(serverAppIntegrations.appKey, appKey))
      .orderBy(desc(serverAppIntegrations.updatedAt))
      .limit(1)
    return rows[0] ?? null
  }

  async countInstallationsByAppKeys(appKeys: string[]) {
    const uniqueAppKeys = [...new Set(appKeys)].filter(Boolean)
    if (uniqueAppKeys.length === 0) return []
    return this.db
      .select({
        appKey: serverAppIntegrations.appKey,
        count: sql<number>`count(*)::int`,
      })
      .from(serverAppIntegrations)
      .where(inArray(serverAppIntegrations.appKey, uniqueAppKeys))
      .groupBy(serverAppIntegrations.appKey)
  }

  async upsert(data: {
    serverId: string
    appKey: string
    name: string
    description?: string | null
    iconUrl?: string | null
    manifestUrl?: string | null
    manifest: ServerAppManifest
    manifestVersion?: string | null
    manifestUpdatedAt?: Date | null
    manifestFetchedAt?: Date
    manifestHash?: string | null
    iframeEntry?: string | null
    allowedOrigins: string[]
    apiBaseUrl: string
    defaultPermissions?: string[]
    defaultApprovalMode?: string
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
        manifestVersion: data.manifestVersion ?? data.manifest.version ?? null,
        manifestUpdatedAt: data.manifestUpdatedAt ?? null,
        manifestFetchedAt: data.manifestFetchedAt ?? new Date(),
        manifestHash: data.manifestHash ?? null,
        iframeEntry: data.iframeEntry ?? null,
        allowedOrigins: data.allowedOrigins,
        apiBaseUrl: data.apiBaseUrl,
        defaultPermissions: data.defaultPermissions ?? [],
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
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
          manifestVersion: data.manifestVersion ?? data.manifest.version ?? null,
          manifestUpdatedAt: data.manifestUpdatedAt ?? null,
          manifestFetchedAt: data.manifestFetchedAt ?? new Date(),
          manifestHash: data.manifestHash ?? null,
          iframeEntry: data.iframeEntry ?? null,
          allowedOrigins: data.allowedOrigins,
          apiBaseUrl: data.apiBaseUrl,
          defaultPermissions: data.defaultPermissions ?? [],
          defaultApprovalMode: data.defaultApprovalMode ?? 'none',
          status: 'active',
          installedByUserId: data.installedByUserId,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async updateManifest(
    serverAppId: string,
    data: {
      name: string
      description?: string | null
      iconUrl?: string | null
      manifestUrl?: string | null
      manifest: ServerAppManifest
      manifestVersion?: string | null
      manifestUpdatedAt?: Date | null
      manifestFetchedAt?: Date
      manifestHash?: string | null
      iframeEntry?: string | null
      allowedOrigins: string[]
      apiBaseUrl: string
    },
  ) {
    const rows = await this.db
      .update(serverAppIntegrations)
      .set({
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        ...(data.manifestUrl !== undefined ? { manifestUrl: data.manifestUrl } : {}),
        manifest: data.manifest,
        manifestVersion: data.manifestVersion ?? data.manifest.version ?? null,
        manifestUpdatedAt: data.manifestUpdatedAt ?? null,
        manifestFetchedAt: data.manifestFetchedAt ?? new Date(),
        manifestHash: data.manifestHash ?? null,
        iframeEntry: data.iframeEntry ?? null,
        allowedOrigins: data.allowedOrigins,
        apiBaseUrl: data.apiBaseUrl,
        updatedAt: sql`NOW()`,
      })
      .where(eq(serverAppIntegrations.id, serverAppId))
      .returning()
    return rows[0] ?? null
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
          status: data.status ?? 'active',
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async updateCatalogEntryManifest(
    id: string,
    data: {
      name: string
      description?: string | null
      iconUrl?: string | null
      manifestUrl?: string | null
      manifest: ServerAppManifest
    },
  ) {
    const rows = await this.db
      .update(serverAppCatalogEntries)
      .set({
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        manifestUrl: data.manifestUrl ?? null,
        manifest: data.manifest,
        updatedAt: sql`NOW()`,
      })
      .where(eq(serverAppCatalogEntries.id, id))
      .returning()
    return rows[0] ?? null
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

  async updateAccessPolicy(
    serverAppId: string,
    data: {
      defaultPermissions: string[]
      defaultApprovalMode?: string
    },
  ) {
    const rows = await this.db
      .update(serverAppIntegrations)
      .set({
        defaultPermissions: data.defaultPermissions,
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
        updatedAt: sql`NOW()`,
      })
      .where(eq(serverAppIntegrations.id, serverAppId))
      .returning()
    return rows[0] ?? null
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

  async upsertCommandConsent(data: {
    serverAppId: string
    serverId: string
    appKey: string
    command: string
    permission: string
    subjectKind: string
    subjectKey: string
    subjectUserId?: string | null
    buddyAgentId?: string | null
    grantedByUserId: string
    approvalMode: string
    expiresAt?: Date | null
  }) {
    const rows = await this.db
      .insert(serverAppCommandConsents)
      .values({
        serverAppId: data.serverAppId,
        serverId: data.serverId,
        appKey: data.appKey,
        command: data.command,
        permission: data.permission,
        subjectKind: data.subjectKind,
        subjectKey: data.subjectKey,
        subjectUserId: data.subjectUserId ?? null,
        buddyAgentId: data.buddyAgentId ?? null,
        grantedByUserId: data.grantedByUserId,
        approvalMode: data.approvalMode,
        expiresAt: data.expiresAt ?? null,
        consumedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          serverAppCommandConsents.serverAppId,
          serverAppCommandConsents.command,
          serverAppCommandConsents.subjectKind,
          serverAppCommandConsents.subjectKey,
        ],
        set: {
          permission: data.permission,
          grantedByUserId: data.grantedByUserId,
          approvalMode: data.approvalMode,
          expiresAt: data.expiresAt ?? null,
          consumedAt: null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async findCommandConsent(input: {
    serverAppId: string
    command: string
    subjectKind: string
    subjectKey: string
  }) {
    const rows = await this.db
      .select()
      .from(serverAppCommandConsents)
      .where(
        and(
          eq(serverAppCommandConsents.serverAppId, input.serverAppId),
          eq(serverAppCommandConsents.command, input.command),
          eq(serverAppCommandConsents.subjectKind, input.subjectKind),
          eq(serverAppCommandConsents.subjectKey, input.subjectKey),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async markCommandConsentConsumed(id: string) {
    await this.db
      .update(serverAppCommandConsents)
      .set({ consumedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(serverAppCommandConsents.id, id))
  }

  async createCommandToken(data: {
    tokenHash: string
    serverAppId: string
    serverId: string
    appKey: string
    command: string
    userId: string
    actorKind: string
    buddyAgentId?: string | null
    ownerId?: string | null
    channelId?: string | null
    taskMessageId?: string | null
    taskCardId?: string | null
    taskClaimId?: string | null
    taskWorkspaceId?: string | null
    permission: string
    action: string
    dataClass: string
    scopes: string[]
    expiresAt: Date
  }) {
    const rows = await this.db.insert(serverAppCommandTokens).values(data).returning()
    return rows[0]!
  }

  async findCommandTokenByHash(tokenHash: string) {
    const rows = await this.db
      .select()
      .from(serverAppCommandTokens)
      .where(eq(serverAppCommandTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }
}
