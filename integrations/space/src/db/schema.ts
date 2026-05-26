import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type {
  SpaceCommentContext,
  SpacePerson,
  SpaceSourceKind,
  SpaceStoredFile,
  SpaceVisibility,
} from '../types.js'

export const spaceProfiles = pgTable('space_profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').default('').notNull(),
  handle: text('handle').default('').notNull(),
  headline: text('headline').default('').notNull(),
  bio: text('bio').default('').notNull(),
  location: text('location'),
  website: text('website'),
  coverUrl: text('cover_url'),
  coverFile: jsonb('cover_file').$type<SpaceStoredFile | null>(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  customCss: text('custom_css').default('').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const spaceArtworks = pgTable(
  'space_artworks',
  {
    id: text('id').primaryKey(),
    owner: jsonb('owner').$type<SpacePerson>().notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    visibility: text('visibility').$type<SpaceVisibility>().default('public').notNull(),
    coverUrl: text('cover_url'),
    coverFile: jsonb('cover_file').$type<SpaceStoredFile | null>(),
    currentVersionId: text('current_version_id').notNull(),
    likedBy: jsonb('liked_by').$type<string[]>().default([]).notNull(),
    favoritedBy: jsonb('favorited_by').$type<string[]>().default([]).notNull(),
    remixCount: integer('remix_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    spaceArtworksUpdatedIdx: index('space_artworks_updated_idx').on(t.updatedAt),
    spaceArtworksVisibilityIdx: index('space_artworks_visibility_idx').on(t.visibility),
  }),
)

export const spaceArtworkVersions = pgTable(
  'space_artwork_versions',
  {
    id: text('id').primaryKey(),
    artworkId: text('artwork_id')
      .notNull()
      .references(() => spaceArtworks.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    sourceKind: text('source_kind').$type<SpaceSourceKind>().notNull(),
    entryPath: text('entry_path').notNull(),
    cdnProvider: text('cdn_provider').$type<'minio' | 'local'>().notNull(),
    cdnBaseUrl: text('cdn_base_url').notNull(),
    files: jsonb('files').$type<SpaceStoredFile[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: jsonb('created_by').$type<SpacePerson>().notNull(),
    rolledBackFromVersionId: text('rolled_back_from_version_id'),
  },
  (t) => ({
    spaceArtworkVersionsArtworkIdx: index('space_artwork_versions_artwork_idx').on(
      t.artworkId,
      t.number,
    ),
    spaceArtworkVersionsNumberUnique: uniqueIndex('space_artwork_versions_number_unique').on(
      t.artworkId,
      t.number,
    ),
  }),
)

export const spaceComments = pgTable(
  'space_comments',
  {
    id: text('id').primaryKey(),
    artworkId: text('artwork_id')
      .notNull()
      .references(() => spaceArtworks.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    author: jsonb('author').$type<SpacePerson>().notNull(),
    context: jsonb('context').$type<SpaceCommentContext | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    spaceCommentsArtworkIdx: index('space_comments_artwork_idx').on(t.artworkId),
  }),
)

export const spaceFavorites = pgTable(
  'space_favorites',
  {
    id: text('id').primaryKey(),
    artworkId: text('artwork_id')
      .notNull()
      .references(() => spaceArtworks.id, { onDelete: 'cascade' }),
    owner: jsonb('owner').$type<SpacePerson>().notNull(),
    ownerKey: text('owner_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    spaceFavoritesOwnerIdx: index('space_favorites_owner_idx').on(t.ownerKey),
    spaceFavoritesUnique: uniqueIndex('space_favorites_artwork_owner_unique').on(
      t.artworkId,
      t.ownerKey,
    ),
  }),
)
