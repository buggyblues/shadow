/**
 * Database Migration — create tables on first run.
 */

import type { CloudDatabase } from './index.js'

export function runMigrations(db: CloudDatabase) {
  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      featured INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      template_slug TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL,
      template_slug TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      config TEXT,
      agent_count INTEGER,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS deployment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id INTEGER NOT NULL,
      event TEXT NOT NULL DEFAULT 'log',
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      namespace TEXT,
      template TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS env_vars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'global',
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      is_secret INTEGER DEFAULT 1,
      group_name TEXT NOT NULL DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS env_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // ── Migrations for existing databases ──────────────────────────────
  // Add group_name column if upgrading from an older schema
  try {
    db.run(/*sql*/ `ALTER TABLE secrets ADD COLUMN group_name TEXT NOT NULL DEFAULT 'default'`)
  } catch {
    /* already exists */
  }
  try {
    db.run(/*sql*/ `ALTER TABLE env_vars ADD COLUMN group_name TEXT NOT NULL DEFAULT 'default'`)
  } catch {
    /* already exists */
  }

  db.run(
    /*sql*/ `CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_id ON deployment_logs(deployment_id, id)`,
  )
  db.run(/*sql*/ `INSERT OR IGNORE INTO env_groups (name) VALUES ('default')`)

  // Version tracking
  try {
    db.run(/*sql*/ `ALTER TABLE configs ADD COLUMN version INTEGER NOT NULL DEFAULT 1`)
  } catch {
    /* already exists */
  }
  try {
    db.run(/*sql*/ `ALTER TABLE deployments ADD COLUMN version INTEGER`)
  } catch {
    /* already exists */
  }

  db.run(/*sql*/ `
    CREATE TABLE IF NOT EXISTS config_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_name TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
}
