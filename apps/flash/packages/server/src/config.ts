// ═══════════════════════════════════════════════════════════════
// Flash — Configuration & Constants
//
// File Structure: git-like index + content separation
// /data/projects/{pid}/refs/    ← index layer (JSON metadata)
// /data/projects/{pid}/objects/ ← content layer (actual files)
// /data/projects/{pid}/ai-output/ ← AI write area
// /data/projects/{pid}/logs/    ← logs & debug
// ═══════════════════════════════════════════════════════════════

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Base directories ──

export const PORT = parseInt(process.env.PORT || '8080')
export const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:3100'
export const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || ''
export const STATIC_DIR = process.env.STATIC_DIR || '/app/ui'
export const DATA_DIR = process.env.DATA_DIR || '/data'
export const OUTPUT_DIR = process.env.OUTPUT_DIR || '/output'

// ── Global files (not project-scoped) ──

export const GLOBAL_CONFIG = join(DATA_DIR, 'global.json')
export const SETTINGS_FILE = join(DATA_DIR, 'settings.json')
export const SKILLS_FILE = join(DATA_DIR, 'skills.json')

// ── Projects root ──

export const PROJECTS_DIR = join(DATA_DIR, 'projects')

// ── Themes & OpenClaw (unchanged) ──

export const THEMES_DIR = process.env.THEMES_DIR || join(DATA_DIR, 'themes')
export const OPENCLAW_SKILLS_DIR = process.env.OPENCLAW_SKILLS_DIR || '/app/workspace/skills'
export const OPENCLAW_DIR = process.env.OPENCLAW_DIR || '/app/workspace'

// ═══════════════════════════════════════════════════════════════
// Project path helpers
// ═══════════════════════════════════════════════════════════════

/** Build absolute path within a project: /data/projects/{pid}/{...segments} */
export function projectPath(pid: string, ...segments: string[]): string {
  return join(PROJECTS_DIR, pid, ...segments)
}

/** Project index file: /data/projects/{pid}/index.json */
export function projectIndex(pid: string): string {
  return projectPath(pid, 'index.json')
}

/** Refs (metadata index) file: /data/projects/{pid}/refs/{filename} */
export function projectRefs(pid: string, filename: string): string {
  return projectPath(pid, 'refs', filename)
}

/** Objects (content) path: /data/projects/{pid}/objects/{...segments} */
export function projectObjects(pid: string, ...segments: string[]): string {
  return projectPath(pid, 'objects', ...segments)
}

/** AI output path: /data/projects/{pid}/ai-output/{...segments} */
export function projectAiOutput(pid: string, ...segments: string[]): string {
  return projectPath(pid, 'ai-output', ...segments)
}

/** Logs path: /data/projects/{pid}/logs/{...segments} */
export function projectLogs(pid: string, ...segments: string[]): string {
  return projectPath(pid, 'logs', ...segments)
}

// ═══════════════════════════════════════════════════════════════
// Directory initialization
// ═══════════════════════════════════════════════════════════════

/** Ensure global directories exist at startup */
export function ensureDirectories(): void {
  mkdirSync(PROJECTS_DIR, { recursive: true })
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

/** Ensure all sub-directories for a specific project */
export function ensureProjectDirs(pid: string): void {
  const subdirs = [
    'refs',
    'objects/materials',
    'objects/card-files',
    'objects/outlines',
    'ai-output',
    'logs',
  ]
  for (const sub of subdirs) {
    mkdirSync(projectPath(pid, sub), { recursive: true })
  }
}
