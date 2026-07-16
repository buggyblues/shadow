import { and, asc, eq, gt } from 'drizzle-orm'
import type { Database } from '../db'
import {
  type CloudConnectorProfile,
  cloudComputerConnectors,
  cloudConnectorConnections,
  cloudConnectorOAuthStates,
} from '../db/schema'

export class CloudConnectorDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async listConnections(userId: string) {
    return this.db
      .select()
      .from(cloudConnectorConnections)
      .where(eq(cloudConnectorConnections.userId, userId))
      .orderBy(asc(cloudConnectorConnections.pluginId))
  }

  async findConnection(userId: string, pluginId: string) {
    const rows = await this.db
      .select()
      .from(cloudConnectorConnections)
      .where(
        and(
          eq(cloudConnectorConnections.userId, userId),
          eq(cloudConnectorConnections.pluginId, pluginId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async findConnectionByIdForUser(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(cloudConnectorConnections)
      .where(
        and(eq(cloudConnectorConnections.id, id), eq(cloudConnectorConnections.userId, userId)),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async upsertConnection(data: {
    userId: string
    pluginId: string
    authType: string
    credentialsEncrypted: string
    credentialFields: string[]
    profile?: CloudConnectorProfile | null
    status?: 'active' | 'invalid'
    verified?: boolean
  }) {
    const now = new Date()
    const rows = await this.db
      .insert(cloudConnectorConnections)
      .values({
        userId: data.userId,
        pluginId: data.pluginId,
        authType: data.authType,
        credentialsEncrypted: data.credentialsEncrypted,
        credentialFields: data.credentialFields,
        profile: data.profile ?? null,
        status: data.status ?? 'active',
        lastVerifiedAt: data.verified ? now : null,
      })
      .onConflictDoUpdate({
        target: [cloudConnectorConnections.userId, cloudConnectorConnections.pluginId],
        set: {
          credentialsEncrypted: data.credentialsEncrypted,
          authType: data.authType,
          credentialFields: data.credentialFields,
          profile: data.profile ?? null,
          status: data.status ?? 'active',
          lastVerifiedAt: data.verified ? now : null,
          updatedAt: now,
        },
      })
      .returning()
    return rows[0] ?? null
  }

  async updateConnectionCredentials(id: string, userId: string, credentialsEncrypted: string) {
    const rows = await this.db
      .update(cloudConnectorConnections)
      .set({ credentialsEncrypted, lastUsedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(cloudConnectorConnections.id, id), eq(cloudConnectorConnections.userId, userId)),
      )
      .returning()
    return rows[0] ?? null
  }

  async updateConnectionVerification(
    userId: string,
    pluginId: string,
    data: {
      profile?: CloudConnectorProfile | null
      status: 'active' | 'invalid'
      verified: boolean
    },
  ) {
    const rows = await this.db
      .update(cloudConnectorConnections)
      .set({
        profile: data.profile ?? null,
        status: data.status,
        lastVerifiedAt: data.verified ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cloudConnectorConnections.userId, userId),
          eq(cloudConnectorConnections.pluginId, pluginId),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  async touchConnection(id: string) {
    await this.db
      .update(cloudConnectorConnections)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(cloudConnectorConnections.id, id))
  }

  async listBindings(userId: string, cloudComputerId: string) {
    return this.db
      .select()
      .from(cloudComputerConnectors)
      .where(
        and(
          eq(cloudComputerConnectors.userId, userId),
          eq(cloudComputerConnectors.cloudComputerId, cloudComputerId),
        ),
      )
      .orderBy(asc(cloudComputerConnectors.pluginId))
  }

  async findBinding(userId: string, cloudComputerId: string, pluginId: string) {
    const rows = await this.db
      .select()
      .from(cloudComputerConnectors)
      .where(
        and(
          eq(cloudComputerConnectors.userId, userId),
          eq(cloudComputerConnectors.cloudComputerId, cloudComputerId),
          eq(cloudComputerConnectors.pluginId, pluginId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async upsertBinding(data: {
    userId: string
    cloudComputerId: string
    pluginId: string
    connectionId: string
    options: Record<string, unknown>
    declaredInBase: boolean
  }) {
    const rows = await this.db
      .insert(cloudComputerConnectors)
      .values({
        userId: data.userId,
        cloudComputerId: data.cloudComputerId,
        pluginId: data.pluginId,
        connectionId: data.connectionId,
        options: data.options,
        declaredInBase: data.declaredInBase,
        status: 'configured',
      })
      .onConflictDoUpdate({
        target: [
          cloudComputerConnectors.userId,
          cloudComputerConnectors.cloudComputerId,
          cloudComputerConnectors.pluginId,
        ],
        set: {
          connectionId: data.connectionId,
          options: data.options,
          status: 'configured',
          targetDeploymentId: null,
          lastError: null,
          updatedAt: new Date(),
        },
      })
      .returning()
    return rows[0] ?? null
  }

  async markBinding(
    id: string,
    data: {
      status: 'configured' | 'applying' | 'ready' | 'error'
      targetDeploymentId?: string | null
      lastError?: string | null
    },
  ) {
    const rows = await this.db
      .update(cloudComputerConnectors)
      .set({
        status: data.status,
        ...(data.targetDeploymentId !== undefined
          ? { targetDeploymentId: data.targetDeploymentId }
          : {}),
        ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cloudComputerConnectors.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteBinding(userId: string, cloudComputerId: string, pluginId: string) {
    const rows = await this.db
      .delete(cloudComputerConnectors)
      .where(
        and(
          eq(cloudComputerConnectors.userId, userId),
          eq(cloudComputerConnectors.cloudComputerId, cloudComputerId),
          eq(cloudComputerConnectors.pluginId, pluginId),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  async createOAuthState(data: {
    userId: string
    pluginId: string
    cloudComputerId: string
    stateHash: string
    codeVerifierEncrypted?: string | null
    redirectUri: string
    expiresAt: Date
  }) {
    const rows = await this.db.insert(cloudConnectorOAuthStates).values(data).returning()
    return rows[0] ?? null
  }

  async findOAuthStateForUser(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(cloudConnectorOAuthStates)
      .where(
        and(eq(cloudConnectorOAuthStates.id, id), eq(cloudConnectorOAuthStates.userId, userId)),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async findOAuthStateByHash(stateHash: string) {
    const rows = await this.db
      .select({ id: cloudConnectorOAuthStates.id })
      .from(cloudConnectorOAuthStates)
      .where(eq(cloudConnectorOAuthStates.stateHash, stateHash))
      .limit(1)
    return rows[0] ?? null
  }

  async claimOAuthState(stateHash: string) {
    const rows = await this.db
      .update(cloudConnectorOAuthStates)
      .set({ status: 'exchanging', updatedAt: new Date() })
      .where(
        and(
          eq(cloudConnectorOAuthStates.stateHash, stateHash),
          eq(cloudConnectorOAuthStates.status, 'pending'),
          gt(cloudConnectorOAuthStates.expiresAt, new Date()),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  async finishOAuthState(
    id: string,
    data: { status: 'completed' | 'error'; error?: string | null },
  ) {
    const rows = await this.db
      .update(cloudConnectorOAuthStates)
      .set({
        status: data.status,
        error: data.error ?? null,
        completedAt: new Date(),
        codeVerifierEncrypted: null,
        updatedAt: new Date(),
      })
      .where(eq(cloudConnectorOAuthStates.id, id))
      .returning()
    return rows[0] ?? null
  }
}
