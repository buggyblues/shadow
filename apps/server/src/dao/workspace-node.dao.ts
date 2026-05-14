import { and, asc, desc, eq, ilike, inArray, isNull, like, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { workspaceNodes } from '../db/schema'

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export class WorkspaceNodeDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(workspaceNodes)
      .where(eq(workspaceNodes.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return []
    return this.db.select().from(workspaceNodes).where(inArray(workspaceNodes.id, ids))
  }

  async findByPath(workspaceId: string, path: string) {
    const result = await this.db
      .select()
      .from(workspaceNodes)
      .where(and(eq(workspaceNodes.workspaceId, workspaceId), eq(workspaceNodes.path, path)))
      .limit(1)
    return result[0] ?? null
  }

  async listChildren(workspaceId: string, parentId: string | null) {
    const condition = parentId
      ? and(eq(workspaceNodes.workspaceId, workspaceId), eq(workspaceNodes.parentId, parentId))
      : and(eq(workspaceNodes.workspaceId, workspaceId), isNull(workspaceNodes.parentId))

    return this.db.select().from(workspaceNodes).where(condition).orderBy(
      // folders first, then by pos, then by name
      sql`CASE WHEN ${workspaceNodes.kind} = 'dir' THEN 0 ELSE 1 END`,
      asc(workspaceNodes.pos),
      asc(workspaceNodes.name),
    )
  }

  async listDescendants(workspaceId: string, pathPrefix: string) {
    const normalizedPrefix = pathPrefix === '/' ? '' : pathPrefix
    const likePrefix = normalizedPrefix ? `${escapeLike(normalizedPrefix)}/%` : '/%'
    return this.db
      .select()
      .from(workspaceNodes)
      .where(
        and(eq(workspaceNodes.workspaceId, workspaceId), like(workspaceNodes.path, likePrefix)),
      )
      .orderBy(asc(workspaceNodes.path))
  }

  async getTree(workspaceId: string) {
    return this.db
      .select()
      .from(workspaceNodes)
      .where(eq(workspaceNodes.workspaceId, workspaceId))
      .orderBy(
        sql`CASE WHEN ${workspaceNodes.kind} = 'dir' THEN 0 ELSE 1 END`,
        asc(workspaceNodes.pos),
        asc(workspaceNodes.name),
      )
  }

  async createFolder(data: {
    workspaceId: string
    parentId: string | null
    name: string
    path: string
    pos?: number
  }) {
    const result = await this.db
      .insert(workspaceNodes)
      .values({
        workspaceId: data.workspaceId,
        parentId: data.parentId,
        kind: 'dir',
        name: data.name,
        path: data.path,
        pos: data.pos ?? 0,
      })
      .returning()
    return result[0]
  }

  async createFile(data: {
    workspaceId: string
    parentId: string | null
    name: string
    path: string
    pos?: number
    ext?: string | null
    mime?: string | null
    sizeBytes?: number | null
    contentRef?: string | null
    previewUrl?: string | null
    flags?: Record<string, unknown> | null
  }) {
    const result = await this.db
      .insert(workspaceNodes)
      .values({
        workspaceId: data.workspaceId,
        parentId: data.parentId,
        kind: 'file',
        name: data.name,
        path: data.path,
        pos: data.pos ?? 0,
        ext: data.ext ?? null,
        mime: data.mime ?? null,
        sizeBytes: data.sizeBytes ?? null,
        contentRef: data.contentRef ?? null,
        previewUrl: data.previewUrl ?? null,
        flags: data.flags ?? null,
      })
      .returning()
    return result[0]
  }

  async updateNode(
    id: string,
    data: Partial<{
      name: string
      parentId: string | null
      path: string
      pos: number
      ext: string | null
      mime: string | null
      sizeBytes: number | null
      contentRef: string | null
      previewUrl: string | null
      flags: Record<string, unknown> | null
    }>,
  ) {
    const result = await this.db
      .update(workspaceNodes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaceNodes.id, id))
      .returning()
    return result[0] ?? null
  }

  async deleteNode(id: string) {
    await this.db.delete(workspaceNodes).where(eq(workspaceNodes.id, id))
  }

  async deleteDescendants(workspaceId: string, pathPrefix: string) {
    await this.db
      .delete(workspaceNodes)
      .where(
        and(
          eq(workspaceNodes.workspaceId, workspaceId),
          like(workspaceNodes.path, `${escapeLike(pathPrefix)}/%`),
        ),
      )
  }

  async deleteByWorkspaceId(workspaceId: string) {
    await this.db.delete(workspaceNodes).where(eq(workspaceNodes.workspaceId, workspaceId))
  }

  async searchFiles(
    workspaceId: string,
    input?: {
      parentId?: string | null
      searchText?: string
      ext?: string
      limit?: number
      offset?: number
    },
  ) {
    const conditions = [
      eq(workspaceNodes.workspaceId, workspaceId),
      eq(workspaceNodes.kind, 'file'),
    ]
    if (input?.parentId !== undefined) {
      if (input.parentId) {
        conditions.push(eq(workspaceNodes.parentId, input.parentId))
      } else {
        conditions.push(isNull(workspaceNodes.parentId))
      }
    }
    if (input?.searchText) {
      conditions.push(ilike(workspaceNodes.name, `%${input.searchText}%`))
    }
    if (input?.ext) {
      conditions.push(eq(workspaceNodes.ext, input.ext))
    }

    let query = this.db
      .select()
      .from(workspaceNodes)
      .where(and(...conditions))
      .orderBy(desc(workspaceNodes.updatedAt))

    if (input?.limit) {
      query = query.limit(input.limit) as typeof query
    }
    if (input?.offset) {
      query = query.offset(input.offset) as typeof query
    }

    return query
  }

  async searchFolders(
    workspaceId: string,
    input?: {
      searchText?: string
      limit?: number
    },
  ) {
    const conditions = [eq(workspaceNodes.workspaceId, workspaceId), eq(workspaceNodes.kind, 'dir')]
    if (input?.searchText) {
      conditions.push(ilike(workspaceNodes.name, `%${input.searchText}%`))
    }

    let query = this.db
      .select()
      .from(workspaceNodes)
      .where(and(...conditions))
      .orderBy(asc(workspaceNodes.path))

    if (input?.limit) {
      query = query.limit(input.limit) as typeof query
    }

    return query
  }

  async getStats(workspaceId: string) {
    const result = await this.db
      .select({
        kind: workspaceNodes.kind,
        count: sql<number>`count(*)::int`,
      })
      .from(workspaceNodes)
      .where(eq(workspaceNodes.workspaceId, workspaceId))
      .groupBy(workspaceNodes.kind)

    let folderCount = 0
    let fileCount = 0
    for (const row of result) {
      if (row.kind === 'dir') folderCount = row.count
      else fileCount = row.count
    }
    return { folderCount, fileCount, totalCount: folderCount + fileCount }
  }

  /** Find sibling names in the same parent directory to resolve unique names. */
  async findSiblingNames(workspaceId: string, parentId: string | null, namePrefix?: string) {
    const conditions = [eq(workspaceNodes.workspaceId, workspaceId)]
    if (parentId) {
      conditions.push(eq(workspaceNodes.parentId, parentId))
    } else {
      conditions.push(isNull(workspaceNodes.parentId))
    }
    if (namePrefix) {
      conditions.push(ilike(workspaceNodes.name, `${escapeLike(namePrefix)}%`))
    }
    const rows = await this.db
      .select({ name: workspaceNodes.name })
      .from(workspaceNodes)
      .where(and(...conditions))
    return rows.map((r) => r.name)
  }

  /** Rewrite paths of all descendants when a folder is renamed or moved. */
  async rewriteDescendantPaths(workspaceId: string, oldPrefix: string, newPrefix: string) {
    await this.db.execute(
      sql`UPDATE workspace_nodes SET path = ${newPrefix} || substring(path from ${oldPrefix.length + 1}), updated_at = now() WHERE workspace_id = ${workspaceId} AND path LIKE ${`${escapeLike(oldPrefix)}/%`}`,
    )
  }
}
