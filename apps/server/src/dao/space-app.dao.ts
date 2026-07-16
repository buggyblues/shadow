import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  type SpaceAppManifest,
  spaceAppBuddyGrants,
  spaceAppCatalogEntries,
  spaceAppCommandConsents,
  spaceAppCommandTokens,
  spaceAppInstallations,
} from '../db/schema'

export class SpaceAppDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async listByServer(serverId: string) {
    return this.db
      .select()
      .from(spaceAppInstallations)
      .where(eq(spaceAppInstallations.serverId, serverId))
      .orderBy(spaceAppInstallations.name)
  }

  async listSummariesByServer(serverId: string) {
    return this.db
      .select({
        id: spaceAppInstallations.id,
        serverId: spaceAppInstallations.serverId,
        appKey: spaceAppInstallations.appKey,
        name: spaceAppInstallations.name,
        iconUrl: spaceAppInstallations.iconUrl,
        manifest: spaceAppInstallations.manifest,
        status: spaceAppInstallations.status,
      })
      .from(spaceAppInstallations)
      .where(eq(spaceAppInstallations.serverId, serverId))
      .orderBy(spaceAppInstallations.name)
  }

  async findById(id: string) {
    const rows = await this.db
      .select()
      .from(spaceAppInstallations)
      .where(eq(spaceAppInstallations.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findByServerAndKey(serverId: string, appKey: string) {
    const rows = await this.db
      .select()
      .from(spaceAppInstallations)
      .where(
        and(eq(spaceAppInstallations.serverId, serverId), eq(spaceAppInstallations.appKey, appKey)),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async findLatestByAppKey(appKey: string) {
    const rows = await this.db
      .select()
      .from(spaceAppInstallations)
      .where(eq(spaceAppInstallations.appKey, appKey))
      .orderBy(desc(spaceAppInstallations.updatedAt))
      .limit(1)
    return rows[0] ?? null
  }

  async countInstallationsByAppKeys(appKeys: string[]) {
    const uniqueAppKeys = [...new Set(appKeys)].filter(Boolean)
    if (uniqueAppKeys.length === 0) return []
    return this.db
      .select({
        appKey: spaceAppInstallations.appKey,
        count: sql<number>`count(*)::int`,
      })
      .from(spaceAppInstallations)
      .where(inArray(spaceAppInstallations.appKey, uniqueAppKeys))
      .groupBy(spaceAppInstallations.appKey)
  }

  async upsert(data: {
    serverId: string
    appKey: string
    name: string
    description?: string | null
    iconUrl?: string | null
    manifestUrl?: string | null
    manifest: SpaceAppManifest
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
      .insert(spaceAppInstallations)
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
        target: [spaceAppInstallations.serverId, spaceAppInstallations.appKey],
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
    spaceAppId: string,
    data: {
      name: string
      description?: string | null
      iconUrl?: string | null
      manifestUrl?: string | null
      manifest: SpaceAppManifest
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
      .update(spaceAppInstallations)
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
      .where(eq(spaceAppInstallations.id, spaceAppId))
      .returning()
    return rows[0] ?? null
  }

  async deleteByServerAndKey(serverId: string, appKey: string) {
    await this.db
      .delete(spaceAppInstallations)
      .where(
        and(eq(spaceAppInstallations.serverId, serverId), eq(spaceAppInstallations.appKey, appKey)),
      )
  }

  async deleteById(id: string) {
    await this.db.delete(spaceAppInstallations).where(eq(spaceAppInstallations.id, id))
  }

  async listCatalogEntries(options: { includeInactive?: boolean } = {}) {
    if (options.includeInactive) {
      return this.db.select().from(spaceAppCatalogEntries).orderBy(spaceAppCatalogEntries.name)
    }
    return this.db
      .select()
      .from(spaceAppCatalogEntries)
      .where(eq(spaceAppCatalogEntries.status, 'active'))
      .orderBy(spaceAppCatalogEntries.name)
  }

  async findCatalogEntryById(id: string) {
    const rows = await this.db
      .select()
      .from(spaceAppCatalogEntries)
      .where(eq(spaceAppCatalogEntries.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findCatalogEntryByAppKey(appKey: string) {
    const rows = await this.db
      .select()
      .from(spaceAppCatalogEntries)
      .where(eq(spaceAppCatalogEntries.appKey, appKey))
      .limit(1)
    return rows[0] ?? null
  }

  async upsertCatalogEntry(data: {
    appKey: string
    name: string
    description?: string | null
    iconUrl?: string | null
    manifestUrl?: string | null
    manifest: SpaceAppManifest
    status?: string
    createdByUserId?: string | null
  }) {
    const rows = await this.db
      .insert(spaceAppCatalogEntries)
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
        target: spaceAppCatalogEntries.appKey,
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
      manifest: SpaceAppManifest
    },
  ) {
    const rows = await this.db
      .update(spaceAppCatalogEntries)
      .set({
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        manifestUrl: data.manifestUrl ?? null,
        manifest: data.manifest,
        updatedAt: sql`NOW()`,
      })
      .where(eq(spaceAppCatalogEntries.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteCatalogEntryById(id: string) {
    await this.db.delete(spaceAppCatalogEntries).where(eq(spaceAppCatalogEntries.id, id))
  }

  async upsertBuddyGrant(data: {
    spaceAppId: string
    buddyAgentId: string
    permissions: string[]
    resourceRules?: Record<string, unknown>
    approvalMode?: string
    createdByUserId: string
    expiresAt?: Date | null
  }) {
    const rows = await this.db
      .insert(spaceAppBuddyGrants)
      .values({
        spaceAppId: data.spaceAppId,
        buddyAgentId: data.buddyAgentId,
        permissions: data.permissions,
        resourceRules: data.resourceRules ?? {},
        approvalMode: data.approvalMode ?? 'none',
        createdByUserId: data.createdByUserId,
        expiresAt: data.expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: [spaceAppBuddyGrants.spaceAppId, spaceAppBuddyGrants.buddyAgentId],
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
    spaceAppId: string,
    data: {
      defaultPermissions: string[]
      defaultApprovalMode?: string
    },
  ) {
    const rows = await this.db
      .update(spaceAppInstallations)
      .set({
        defaultPermissions: data.defaultPermissions,
        defaultApprovalMode: data.defaultApprovalMode ?? 'none',
        updatedAt: sql`NOW()`,
      })
      .where(eq(spaceAppInstallations.id, spaceAppId))
      .returning()
    return rows[0] ?? null
  }

  async findBuddyGrant(spaceAppId: string, buddyAgentId: string) {
    const rows = await this.db
      .select()
      .from(spaceAppBuddyGrants)
      .where(
        and(
          eq(spaceAppBuddyGrants.spaceAppId, spaceAppId),
          eq(spaceAppBuddyGrants.buddyAgentId, buddyAgentId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async listBuddyGrants(spaceAppId: string) {
    return this.db
      .select()
      .from(spaceAppBuddyGrants)
      .where(eq(spaceAppBuddyGrants.spaceAppId, spaceAppId))
      .orderBy(spaceAppBuddyGrants.createdAt)
  }

  async upsertCommandConsent(data: {
    spaceAppId: string
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
      .insert(spaceAppCommandConsents)
      .values({
        spaceAppId: data.spaceAppId,
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
          spaceAppCommandConsents.spaceAppId,
          spaceAppCommandConsents.command,
          spaceAppCommandConsents.subjectKind,
          spaceAppCommandConsents.subjectKey,
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
    spaceAppId: string
    command: string
    subjectKind: string
    subjectKey: string
  }) {
    const rows = await this.db
      .select()
      .from(spaceAppCommandConsents)
      .where(
        and(
          eq(spaceAppCommandConsents.spaceAppId, input.spaceAppId),
          eq(spaceAppCommandConsents.command, input.command),
          eq(spaceAppCommandConsents.subjectKind, input.subjectKind),
          eq(spaceAppCommandConsents.subjectKey, input.subjectKey),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async markCommandConsentConsumed(id: string) {
    await this.db
      .update(spaceAppCommandConsents)
      .set({ consumedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(spaceAppCommandConsents.id, id))
  }

  async createCommandToken(data: {
    tokenHash: string
    spaceAppId: string
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
    const rows = await this.db.insert(spaceAppCommandTokens).values(data).returning()
    return rows[0]!
  }

  async findCommandTokenByHash(tokenHash: string) {
    const rows = await this.db
      .select()
      .from(spaceAppCommandTokens)
      .where(eq(spaceAppCommandTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0] ?? null
  }
}
