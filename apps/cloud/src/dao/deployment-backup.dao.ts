/**
 * DAO — Deployment state backup tracking.
 */

import { and, desc, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type DeploymentBackup, deploymentBackups, type NewDeploymentBackup } from '../db/schema.js'

export class DeploymentBackupDao {
  constructor(private db: CloudDatabase) {}

  findByAgent(namespace: string, agentId: string): DeploymentBackup[] {
    return this.db
      .select()
      .from(deploymentBackups)
      .where(
        and(eq(deploymentBackups.namespace, namespace), eq(deploymentBackups.agentId, agentId)),
      )
      .orderBy(desc(deploymentBackups.createdAt))
      .all()
  }

  create(data: NewDeploymentBackup): DeploymentBackup {
    return this.db.insert(deploymentBackups).values(data).returning().get()
  }

  update(id: number, data: Partial<NewDeploymentBackup>): DeploymentBackup | undefined {
    return this.db
      .update(deploymentBackups)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(deploymentBackups.id, id))
      .returning()
      .get()
  }
}
