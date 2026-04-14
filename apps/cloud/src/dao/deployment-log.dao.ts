/**
 * DAO — persisted deployment task logs.
 */

import { asc, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type DeploymentLog, deploymentLogs, type NewDeploymentLog } from '../db/schema.js'

export class DeploymentLogDao {
  constructor(private db: CloudDatabase) {}

  findByDeploymentId(deploymentId: number): DeploymentLog[] {
    return this.db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId))
      .orderBy(asc(deploymentLogs.id))
      .all()
  }

  findByDeploymentIdSince(deploymentId: number, lastId: number): DeploymentLog[] {
    return this.findByDeploymentId(deploymentId).filter((log) => log.id > lastId)
  }

  create(data: NewDeploymentLog): DeploymentLog {
    return this.db.insert(deploymentLogs).values(data).returning().get()
  }
}
