import { sql } from 'drizzle-orm'
import type { SpaceDatabase } from './client.js'

export async function migrate(db: SpaceDatabase) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS space_profiles (
      id text PRIMARY KEY,
      display_name text NOT NULL DEFAULT '',
      handle text NOT NULL DEFAULT '',
      headline text NOT NULL DEFAULT '',
      bio text NOT NULL DEFAULT '',
      location text,
      website text,
      cover_url text,
      cover_file jsonb,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      custom_css text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(sql`
    INSERT INTO space_profiles (id)
    VALUES ('default')
    ON CONFLICT (id) DO NOTHING;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS space_artworks (
      id text PRIMARY KEY,
      owner jsonb NOT NULL,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      visibility text NOT NULL DEFAULT 'public',
      cover_url text,
      cover_file jsonb,
      current_version_id text NOT NULL,
      liked_by jsonb NOT NULL DEFAULT '[]'::jsonb,
      favorited_by jsonb NOT NULL DEFAULT '[]'::jsonb,
      remix_count integer NOT NULL DEFAULT 0,
      view_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS space_artworks_updated_idx ON space_artworks (updated_at);`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS space_artworks_visibility_idx ON space_artworks (visibility);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS space_artwork_versions (
      id text PRIMARY KEY,
      artwork_id text NOT NULL REFERENCES space_artworks(id) ON DELETE CASCADE,
      number integer NOT NULL,
      title text NOT NULL,
      notes text,
      source_kind text NOT NULL,
      entry_path text NOT NULL,
      cdn_provider text NOT NULL,
      cdn_base_url text NOT NULL,
      files jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by jsonb NOT NULL,
      rolled_back_from_version_id text,
      UNIQUE (artwork_id, number)
    );
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS space_artwork_versions_artwork_idx
    ON space_artwork_versions (artwork_id, number);
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS space_comments (
      id text PRIMARY KEY,
      artwork_id text NOT NULL REFERENCES space_artworks(id) ON DELETE CASCADE,
      body text NOT NULL,
      author jsonb NOT NULL,
      context jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(sql`ALTER TABLE space_comments ADD COLUMN IF NOT EXISTS context jsonb;`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS space_comments_artwork_idx ON space_comments (artwork_id);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS space_favorites (
      id text PRIMARY KEY,
      artwork_id text NOT NULL REFERENCES space_artworks(id) ON DELETE CASCADE,
      owner jsonb NOT NULL,
      owner_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (artwork_id, owner_key)
    );
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS space_favorites_owner_idx ON space_favorites (owner_key);`,
  )
}
