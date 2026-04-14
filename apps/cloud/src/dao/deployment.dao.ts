/**
 * DAO — Deployment state tracking.
 */

import { desc, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type Deployment, deployments, type NewDeployment } from '../db/schema.js'

export class DeploymentDao {
  constructor(private db: CloudDatabase) {}

  findAll(): Deployment[] {
    return this.db.select().from(deployments).orderBy(desc(deployments.createdAt)).all()
  }

  findById(id: number): Deployment | undefined {
    return this.db.select().from(deployments).where(eq(deployments.id, id)).get()
  }

  findByNamespace(namespace: string): Deployment[] {
    return this.db
      .select()
      .from(deployments)
      .where(eq(deployments.namespace, namespace))
      .orderBy(desc(deployments.createdAt))
      .all()
  }

  create(data: NewDeployment): Deployment {
    return this.db.insert(deployments).values(data).returning().get()
  }

  update(id: number, data: Partial<NewDeployment>): Deployment | undefined {
    return this.db
      .update(deployments)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(deployments.id, id))
      .returning()
      .get()
  }

  updateStatus(id: number, status: string, error?: string): Deployment | undefined {
    return this.update(id, { status, error })
  }

  delete(id: number): void {
    this.db.delete(deployments).where(eq(deployments.id, id)).run()
  }
}
