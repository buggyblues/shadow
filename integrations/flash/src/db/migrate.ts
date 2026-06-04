import { sql } from 'drizzle-orm'
import type { FlashDatabase } from './client.js'

export async function migrate(db: FlashDatabase) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_boards (
      id text PRIMARY KEY,
      server_id text NOT NULL,
      owner_user_id text NOT NULL,
      title text NOT NULL,
      viewport jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (server_id, owner_user_id)
    );
  `)
  await db.execute(sql`ALTER TABLE flash_boards ADD COLUMN IF NOT EXISTS viewport jsonb;`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_boards_server_idx ON flash_boards (server_id);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_cards (
      id text PRIMARY KEY,
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      kind text NOT NULL,
      title text NOT NULL,
      summary text,
      content text,
      thumbnail text,
      source_id text,
      linked_card_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      priority text NOT NULL DEFAULT 'medium',
      auto_generated boolean NOT NULL DEFAULT false,
      rating integer NOT NULL DEFAULT 0,
      file_path text,
      file_mime text,
      deck_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      x real NOT NULL DEFAULT 240,
      y real NOT NULL DEFAULT 220,
      angle real NOT NULL DEFAULT 0,
      flipped boolean NOT NULL DEFAULT false,
      hidden boolean NOT NULL DEFAULT false,
      locked boolean NOT NULL DEFAULT false,
      revision integer NOT NULL DEFAULT 0,
      created_by jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(
    sql`ALTER TABLE flash_cards ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;`,
  )
  await db.execute(sql`CREATE INDEX IF NOT EXISTS flash_cards_board_idx ON flash_cards (board_id);`)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_cards_updated_idx ON flash_cards (updated_at);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_arenas (
      id text PRIMARY KEY,
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      kind text NOT NULL,
      label text NOT NULL,
      x real NOT NULL DEFAULT 520,
      y real NOT NULL DEFAULT 360,
      radius real NOT NULL DEFAULT 280,
      color text NOT NULL DEFAULT '#7c3aed',
      card_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      script text,
      revision integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(sql`ALTER TABLE flash_arenas ADD COLUMN IF NOT EXISTS script text;`)
  await db.execute(
    sql`ALTER TABLE flash_arenas ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_arenas_board_idx ON flash_arenas (board_id);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_command_events (
      id text PRIMARY KEY,
      seq bigserial NOT NULL,
      board_seq bigint NOT NULL DEFAULT 0,
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      card_id text,
      command_name text NOT NULL,
      command jsonb,
      result jsonb,
      patches jsonb NOT NULL DEFAULT '[]'::jsonb,
      client_mutation_id text,
      base_cursor bigint,
      causal_lag bigint NOT NULL DEFAULT 0,
      actor jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS flash_command_events_seq_seq;`)
  await db.execute(sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS seq bigint;`)
  await db.execute(
    sql`ALTER TABLE flash_command_events ALTER COLUMN seq SET DEFAULT nextval('flash_command_events_seq_seq');`,
  )
  await db.execute(
    sql`UPDATE flash_command_events SET seq = nextval('flash_command_events_seq_seq') WHERE seq IS NULL;`,
  )
  await db.execute(sql`ALTER TABLE flash_command_events ALTER COLUMN seq SET NOT NULL;`)
  await db.execute(
    sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS board_seq bigint NOT NULL DEFAULT 0;`,
  )
  await db.execute(
    sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS patches jsonb NOT NULL DEFAULT '[]'::jsonb;`,
  )
  await db.execute(
    sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS client_mutation_id text;`,
  )
  await db.execute(
    sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS base_cursor bigint;`,
  )
  await db.execute(
    sql`ALTER TABLE flash_command_events ADD COLUMN IF NOT EXISTS causal_lag bigint NOT NULL DEFAULT 0;`,
  )
  await db.execute(sql`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY seq, created_at, id)::bigint AS next_board_seq
      FROM flash_command_events
      WHERE board_seq = 0
    )
    UPDATE flash_command_events e
    SET board_seq = ranked.next_board_seq
    FROM ranked
    WHERE e.id = ranked.id;
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_command_events_board_idx ON flash_command_events (board_id);`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_command_events_global_seq_idx ON flash_command_events (seq);`,
  )
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_command_events_legacy_board_seq_idx ON flash_command_events (board_id, seq);`,
  )
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'flash_command_events_board_seq_unique'
      ) THEN
        CREATE UNIQUE INDEX flash_command_events_board_seq_unique ON flash_command_events (board_id, board_seq);
      END IF;
    END $$;
  `)
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'flash_command_events_mutation_unique'
      ) THEN
        CREATE UNIQUE INDEX flash_command_events_mutation_unique
          ON flash_command_events (board_id, client_mutation_id)
          WHERE client_mutation_id IS NOT NULL;
      END IF;
    END $$;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_board_snapshots (
      id text PRIMARY KEY,
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      cursor bigint NOT NULL,
      schema_version integer NOT NULL DEFAULT 1,
      snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (board_id, cursor)
    );
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_board_snapshots_board_idx ON flash_board_snapshots (board_id);`,
  )

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_mutation_receipts (
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      client_mutation_id text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      event_id text REFERENCES flash_command_events(id) ON DELETE SET NULL,
      result jsonb,
      error text,
      actor jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (board_id, client_mutation_id)
    );
  `)
  await db.execute(sql`
    ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
  `)
  await db.execute(sql`
    ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS event_id text REFERENCES flash_command_events(id) ON DELETE SET NULL;
  `)
  await db.execute(sql`ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS result jsonb;`)
  await db.execute(sql`ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS error text;`)
  await db.execute(sql`ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS actor jsonb;`)
  await db.execute(sql`
    ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  `)
  await db.execute(sql`
    ALTER TABLE flash_mutation_receipts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS flash_mutation_receipts_status_idx
      ON flash_mutation_receipts (board_id, status);
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_selections (
      board_id text NOT NULL REFERENCES flash_boards(id) ON DELETE CASCADE,
      actor_id text NOT NULL,
      actor jsonb,
      selected_card_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      anchor_card_id text,
      revision integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (board_id, actor_id)
    );
  `)
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS flash_selections_board_idx ON flash_selections (board_id);`,
  )
}
