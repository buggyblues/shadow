import type { ShadowSpaceAppActorRef } from '@shadowob/sdk'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { SpaceDatabase } from '../db/client.js'
import {
  spaceArtworks,
  spaceArtworkVersions,
  spaceComments,
  spaceFavorites,
  spaceProfiles,
} from '../db/schema.js'
import type {
  SpaceArtwork,
  SpaceArtworkVersion,
  SpaceCdnProvider,
  SpaceComment,
  SpaceCommentContext,
  SpaceFavorite,
  SpacePerson,
  SpaceProfile,
  SpaceSourceKind,
  SpaceStoredFile,
  SpaceVisibility,
} from '../types.js'

const PROFILE_ID = 'default'
const now = () => new Date()

export function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function person(actor: ShadowSpaceAppActorRef): SpacePerson {
  return actor
}

function actorKey(actor: SpacePerson) {
  return `${actor.kind}:${actor.id || actor.userId || actor.buddyAgentId || actor.ownerId || 'local'}`
}

function cleanTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12)
}

function cleanVisibility(value: unknown): SpaceVisibility {
  return value === 'private' ? 'private' : 'public'
}

function iso(value: Date) {
  return value.toISOString()
}

function maybe<T>(value: T | null | undefined) {
  return value ?? undefined
}

function fromProfileRow(row: typeof spaceProfiles.$inferSelect): SpaceProfile {
  return {
    displayName: row.displayName,
    handle: row.handle,
    headline: row.headline,
    bio: row.bio,
    location: maybe(row.location),
    website: maybe(row.website),
    coverUrl: maybe(row.coverUrl),
    coverFile: row.coverFile ?? undefined,
    tags: row.tags,
    customCss: row.customCss,
  }
}

function fromVersionRow(row: typeof spaceArtworkVersions.$inferSelect): SpaceArtworkVersion {
  return {
    id: row.id,
    artworkId: row.artworkId,
    number: row.number,
    title: row.title,
    notes: maybe(row.notes),
    sourceKind: row.sourceKind as SpaceSourceKind,
    entryPath: row.entryPath,
    cdnProvider: row.cdnProvider as SpaceCdnProvider,
    cdnBaseUrl: row.cdnBaseUrl,
    files: row.files,
    createdAt: iso(row.createdAt),
    createdBy: row.createdBy,
    rolledBackFromVersionId: maybe(row.rolledBackFromVersionId),
  }
}

function fromCommentRow(row: typeof spaceComments.$inferSelect): SpaceComment {
  return {
    id: row.id,
    artworkId: row.artworkId,
    body: row.body,
    author: row.author,
    context: row.context ?? undefined,
    createdAt: iso(row.createdAt),
  }
}

function fromFavoriteRow(row: typeof spaceFavorites.$inferSelect): SpaceFavorite {
  return {
    id: row.id,
    artworkId: row.artworkId,
    owner: row.owner,
    createdAt: iso(row.createdAt),
  }
}

function fromArtworkRow(
  row: typeof spaceArtworks.$inferSelect,
  versions: SpaceArtworkVersion[],
  comments: SpaceComment[],
): SpaceArtwork {
  return {
    id: row.id,
    owner: row.owner,
    title: row.title,
    description: row.description,
    tags: row.tags,
    visibility: row.visibility,
    coverUrl: maybe(row.coverUrl),
    coverFile: row.coverFile ?? undefined,
    currentVersionId: row.currentVersionId,
    versions,
    comments,
    likedBy: row.likedBy,
    favoritedBy: row.favoritedBy,
    remixCount: row.remixCount,
    viewCount: row.viewCount,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export class SpaceDao {
  constructor(private readonly db: SpaceDatabase) {}

  async getProfile() {
    const rows = await this.db
      .select()
      .from(spaceProfiles)
      .where(eq(spaceProfiles.id, PROFILE_ID))
      .limit(1)
    const row = rows[0]
    if (row) return fromProfileRow(row)
    const created = await this.db
      .insert(spaceProfiles)
      .values({ id: PROFILE_ID })
      .onConflictDoNothing()
      .returning()
    return fromProfileRow(
      created[0] ?? {
        id: PROFILE_ID,
        displayName: '',
        handle: '',
        headline: '',
        bio: '',
        location: null,
        website: null,
        coverUrl: null,
        coverFile: null,
        tags: [],
        customCss: '',
        updatedAt: now(),
      },
    )
  }

  async updateProfile(input: { patch: Partial<SpaceProfile> }) {
    const current = await this.getProfile()
    const patch = input.patch
    const next: SpaceProfile = {
      ...current,
      ...patch,
      tags: patch.tags ? cleanTags(patch.tags) : current.tags,
      customCss: patch.customCss?.slice(0, 8000) ?? current.customCss,
    }
    const rows = await this.db
      .update(spaceProfiles)
      .set({
        displayName: next.displayName,
        handle: next.handle,
        headline: next.headline,
        bio: next.bio,
        location: next.location ?? null,
        website: next.website ?? null,
        coverUrl: next.coverUrl ?? null,
        coverFile: next.coverFile ?? null,
        tags: next.tags,
        customCss: next.customCss,
        updatedAt: now(),
      })
      .where(eq(spaceProfiles.id, PROFILE_ID))
      .returning()
    return fromProfileRow(rows[0]!)
  }

  async setProfileCover(file: SpaceStoredFile) {
    const rows = await this.db
      .update(spaceProfiles)
      .set({ coverUrl: file.url, coverFile: file, updatedAt: now() })
      .where(eq(spaceProfiles.id, PROFILE_ID))
      .returning()
    return fromProfileRow(rows[0]!)
  }

  async listArtworks(input: {
    query?: string
    tag?: string
    visibility?: SpaceVisibility | 'all'
    limit?: number
  }) {
    const query = input.query?.trim().toLowerCase()
    const tag = input.tag?.trim().toLowerCase()
    const visibility = input.visibility ?? 'all'
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
    const rows = await this.db.select().from(spaceArtworks).orderBy(desc(spaceArtworks.updatedAt))
    const artworks = await this.hydrate(rows)
    return artworks
      .filter((artwork) => {
        if (visibility !== 'all' && artwork.visibility !== visibility) return false
        if (tag && !artwork.tags.some((item) => item.toLowerCase() === tag)) return false
        const haystack = [artwork.title, artwork.description, artwork.tags.join(' ')]
          .join(' ')
          .toLowerCase()
        return !query || haystack.includes(query)
      })
      .slice(0, limit)
  }

  async getArtwork(artworkId: string) {
    const rows = await this.db
      .select()
      .from(spaceArtworks)
      .where(eq(spaceArtworks.id, artworkId))
      .limit(1)
    const hydrated = await this.hydrate(rows)
    return hydrated[0] ?? null
  }

  async listTags() {
    const rows = await this.db.select({ tags: spaceArtworks.tags }).from(spaceArtworks)
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }

  async listFavorites() {
    const rows = await this.db.select().from(spaceFavorites).orderBy(desc(spaceFavorites.createdAt))
    const artworkIds = Array.from(new Set(rows.map((row) => row.artworkId)))
    const artworks = await this.artworksByIds(artworkIds)
    return rows
      .map((row) => {
        const artwork = artworks.get(row.artworkId)
        return artwork ? { favorite: fromFavoriteRow(row), artwork } : null
      })
      .filter((item): item is { favorite: SpaceFavorite; artwork: SpaceArtwork } => !!item)
  }

  async saveUploadedVersion(input: {
    artworkId?: string
    versionId?: string
    title: string
    description?: string
    tags?: string[]
    visibility?: SpaceVisibility
    versionTitle?: string
    notes?: string
    sourceKind: SpaceSourceKind
    entryPath: string
    cdnProvider: SpaceCdnProvider
    cdnBaseUrl: string
    files: SpaceStoredFile[]
    owner: ShadowSpaceAppActorRef
  }) {
    const artworkId = await this.db.transaction(async (tx) => {
      const timestamp = now()
      const owner = person(input.owner)
      const existingRows = input.artworkId
        ? await tx
            .select()
            .from(spaceArtworks)
            .where(eq(spaceArtworks.id, input.artworkId))
            .limit(1)
        : []
      const existing = existingRows[0]
      const artworkId = existing?.id ?? input.artworkId ?? id('art')
      const versionId = input.versionId ?? id('ver')
      const versionNumber = existing
        ? Number(
            (
              await tx
                .select({
                  nextNumber: sql<number>`COALESCE(MAX(${spaceArtworkVersions.number}), 0) + 1`,
                })
                .from(spaceArtworkVersions)
                .where(eq(spaceArtworkVersions.artworkId, artworkId))
            )[0]?.nextNumber ?? 1,
          )
        : 1
      const version: typeof spaceArtworkVersions.$inferInsert = {
        id: versionId,
        artworkId,
        number: versionNumber,
        title: input.versionTitle?.trim() || (existing ? `版本 ${versionNumber}` : '初版'),
        notes: input.notes?.trim() || null,
        sourceKind: input.sourceKind,
        entryPath: input.entryPath,
        cdnProvider: input.cdnProvider,
        cdnBaseUrl: input.cdnBaseUrl,
        files: input.files,
        createdAt: timestamp,
        createdBy: owner,
      }

      if (!existing) {
        await tx.insert(spaceArtworks).values({
          id: artworkId,
          owner,
          title: input.title.trim(),
          description: input.description?.trim() || '',
          tags: cleanTags(input.tags),
          visibility: cleanVisibility(input.visibility),
          currentVersionId: version.id,
          likedBy: [],
          favoritedBy: [],
          remixCount: 0,
          viewCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      } else {
        await tx
          .update(spaceArtworks)
          .set({
            title: input.title.trim() || existing.title,
            description:
              input.description !== undefined ? input.description.trim() : existing.description,
            tags: input.tags ? cleanTags(input.tags) : existing.tags,
            visibility: input.visibility ? cleanVisibility(input.visibility) : existing.visibility,
            currentVersionId: version.id,
            updatedAt: timestamp,
          })
          .where(eq(spaceArtworks.id, artworkId))
      }

      await tx.insert(spaceArtworkVersions).values(version)
      return artworkId
    })
    return (await this.getArtwork(artworkId))!
  }

  async updateArtwork(input: {
    artworkId: string
    patch: {
      title?: string
      description?: string
      tags?: string[]
      visibility?: SpaceVisibility
    }
  }) {
    const current = await this.getArtwork(input.artworkId)
    if (!current) return null
    const rows = await this.db
      .update(spaceArtworks)
      .set({
        title: input.patch.title !== undefined ? input.patch.title.trim() : current.title,
        description:
          input.patch.description !== undefined
            ? input.patch.description.trim()
            : current.description,
        tags: input.patch.tags ? cleanTags(input.patch.tags) : current.tags,
        visibility: input.patch.visibility
          ? cleanVisibility(input.patch.visibility)
          : current.visibility,
        updatedAt: now(),
      })
      .where(eq(spaceArtworks.id, input.artworkId))
      .returning()
    const hydrated = await this.hydrate(rows)
    return hydrated[0] ?? null
  }

  async setArtworkCover(input: { artworkId: string; file: SpaceStoredFile }) {
    const rows = await this.db
      .update(spaceArtworks)
      .set({ coverUrl: input.file.url, coverFile: input.file, updatedAt: now() })
      .where(eq(spaceArtworks.id, input.artworkId))
      .returning()
    const hydrated = await this.hydrate(rows)
    return hydrated[0] ?? null
  }

  async addComment(input: {
    artworkId: string
    body: string
    context?: SpaceCommentContext
    author: ShadowSpaceAppActorRef
  }) {
    const artwork = await this.getArtwork(input.artworkId)
    if (!artwork) return null
    const timestamp = now()
    const comment = {
      id: id('comment'),
      artworkId: artwork.id,
      body: input.body.trim(),
      author: person(input.author),
      context: input.context ?? null,
      createdAt: timestamp,
    } satisfies typeof spaceComments.$inferInsert
    const rows = await this.db.insert(spaceComments).values(comment).returning()
    await this.touchArtwork(artwork.id)
    return fromCommentRow(rows[0]!)
  }

  async toggleLike(input: { artworkId: string; actor: ShadowSpaceAppActorRef }) {
    const rows = await this.db
      .select()
      .from(spaceArtworks)
      .where(eq(spaceArtworks.id, input.artworkId))
      .limit(1)
    const artwork = rows[0]
    if (!artwork) return null
    const key = actorKey(person(input.actor))
    const likedBy = [...artwork.likedBy]
    const index = likedBy.indexOf(key)
    const liked = index === -1
    if (liked) likedBy.push(key)
    else likedBy.splice(index, 1)
    await this.db
      .update(spaceArtworks)
      .set({ likedBy, updatedAt: now() })
      .where(eq(spaceArtworks.id, input.artworkId))
    return { liked, likes: likedBy.length }
  }

  async toggleFavorite(input: { artworkId: string; actor: ShadowSpaceAppActorRef }) {
    return this.db.transaction(async (tx) => {
      const artworkRows = await tx
        .select()
        .from(spaceArtworks)
        .where(eq(spaceArtworks.id, input.artworkId))
        .limit(1)
      const artwork = artworkRows[0]
      if (!artwork) return null
      const owner = person(input.actor)
      const key = actorKey(owner)
      const existingRows = await tx
        .select()
        .from(spaceFavorites)
        .where(and(eq(spaceFavorites.artworkId, input.artworkId), eq(spaceFavorites.ownerKey, key)))
        .limit(1)
      const favorited = existingRows.length === 0
      let favoritedBy = [...artwork.favoritedBy]
      if (favorited) {
        favoritedBy = Array.from(new Set([...favoritedBy, key]))
        await tx
          .insert(spaceFavorites)
          .values({ id: id('fav'), artworkId: input.artworkId, owner, ownerKey: key })
          .onConflictDoNothing()
      } else {
        favoritedBy = favoritedBy.filter((item) => item !== key)
        await tx
          .delete(spaceFavorites)
          .where(
            and(eq(spaceFavorites.artworkId, input.artworkId), eq(spaceFavorites.ownerKey, key)),
          )
      }
      await tx
        .update(spaceArtworks)
        .set({ favoritedBy, updatedAt: now() })
        .where(eq(spaceArtworks.id, input.artworkId))
      return { favorited, favorites: favoritedBy.length }
    })
  }

  async remixArtwork(input: { artworkId: string; actor: ShadowSpaceAppActorRef }) {
    const source = await this.getArtwork(input.artworkId)
    const sourceVersion =
      source?.versions.find((version) => version.id === source.currentVersionId) ??
      source?.versions.at(-1) ??
      null
    if (!source || !sourceVersion) return null
    const newArtworkId = await this.db.transaction(async (tx) => {
      const timestamp = now()
      const owner = person(input.actor)
      const artworkId = id('art')
      const version: typeof spaceArtworkVersions.$inferInsert = {
        id: id('ver'),
        artworkId,
        number: 1,
        title: `Response to ${sourceVersion.title}`,
        notes: `Made after ${source.title}`,
        sourceKind: sourceVersion.sourceKind,
        entryPath: sourceVersion.entryPath,
        cdnProvider: sourceVersion.cdnProvider,
        cdnBaseUrl: sourceVersion.cdnBaseUrl,
        files: sourceVersion.files,
        createdAt: timestamp,
        createdBy: owner,
      }
      await tx.insert(spaceArtworks).values({
        id: artworkId,
        owner,
        title: `${source.title} response`,
        description: source.description,
        tags: cleanTags([...source.tags, 'response']),
        visibility: 'private',
        coverUrl: source.coverUrl ?? null,
        coverFile: source.coverFile ?? null,
        currentVersionId: version.id,
        likedBy: [],
        favoritedBy: [],
        remixCount: 0,
        viewCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await tx.insert(spaceArtworkVersions).values(version)
      await tx
        .update(spaceArtworks)
        .set({
          remixCount: sql`${spaceArtworks.remixCount} + 1`,
          updatedAt: timestamp,
        })
        .where(eq(spaceArtworks.id, source.id))
      return artworkId
    })
    return this.getArtwork(newArtworkId)
  }

  async rollbackVersion(input: {
    artworkId: string
    versionId: string
    actor: ShadowSpaceAppActorRef
  }) {
    const artwork = await this.getArtwork(input.artworkId)
    if (!artwork) return null
    const target = artwork.versions.find((version) => version.id === input.versionId)
    if (!target) return null
    await this.db.transaction(async (tx) => {
      const timestamp = now()
      const rollback: typeof spaceArtworkVersions.$inferInsert = {
        id: id('ver'),
        artworkId: artwork.id,
        number: artwork.versions.length + 1,
        title: `Restored edition ${target.number}`,
        notes: target.title,
        sourceKind: target.sourceKind,
        entryPath: target.entryPath,
        cdnProvider: target.cdnProvider,
        cdnBaseUrl: target.cdnBaseUrl,
        files: target.files,
        createdAt: timestamp,
        createdBy: person(input.actor),
        rolledBackFromVersionId: target.id,
      }
      await tx.insert(spaceArtworkVersions).values(rollback)
      await tx
        .update(spaceArtworks)
        .set({ currentVersionId: rollback.id, updatedAt: timestamp })
        .where(eq(spaceArtworks.id, artwork.id))
    })
    return this.getArtwork(artwork.id)
  }

  async recordView(artworkId: string) {
    await this.db
      .update(spaceArtworks)
      .set({ viewCount: sql`${spaceArtworks.viewCount} + 1` })
      .where(eq(spaceArtworks.id, artworkId))
  }

  async resolveVersionFile(input: { artworkId: string; versionId: string; path?: string }) {
    const artwork = await this.getArtwork(input.artworkId)
    if (!artwork) return null
    const version = artwork.versions.find((item) => item.id === input.versionId)
    if (!version) return null
    const filePath = (input.path?.replace(/^\/+/, '') || version.entryPath).replace(/\/+$/, '')
    const file = version.files.find((item) => item.path === filePath)
    if (!file) return null
    return { artwork, version, file }
  }

  private async touchArtwork(artworkId: string) {
    await this.db
      .update(spaceArtworks)
      .set({ updatedAt: now() })
      .where(eq(spaceArtworks.id, artworkId))
  }

  private async artworksByIds(artworkIds: string[]) {
    if (!artworkIds.length) return new Map<string, SpaceArtwork>()
    const rows = await this.db
      .select()
      .from(spaceArtworks)
      .where(inArray(spaceArtworks.id, artworkIds))
    const artworks = await this.hydrate(rows)
    return new Map(artworks.map((artwork) => [artwork.id, artwork]))
  }

  private async hydrate(rows: (typeof spaceArtworks.$inferSelect)[]) {
    const artworkIds = rows.map((row) => row.id)
    if (!artworkIds.length) return []
    const versionRows = await this.db
      .select()
      .from(spaceArtworkVersions)
      .where(inArray(spaceArtworkVersions.artworkId, artworkIds))
      .orderBy(asc(spaceArtworkVersions.artworkId), asc(spaceArtworkVersions.number))
    const commentRows = await this.db
      .select()
      .from(spaceComments)
      .where(inArray(spaceComments.artworkId, artworkIds))
      .orderBy(asc(spaceComments.createdAt))
    const versions = new Map<string, SpaceArtworkVersion[]>()
    for (const row of versionRows) {
      const list = versions.get(row.artworkId) ?? []
      list.push(fromVersionRow(row))
      versions.set(row.artworkId, list)
    }
    const comments = new Map<string, SpaceComment[]>()
    for (const row of commentRows) {
      const list = comments.get(row.artworkId) ?? []
      list.push(fromCommentRow(row))
      comments.set(row.artworkId, list)
    }
    return rows.map((row) =>
      fromArtworkRow(row, versions.get(row.id) ?? [], comments.get(row.id) ?? []),
    )
  }
}
