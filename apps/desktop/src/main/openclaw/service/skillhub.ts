/**
 * OpenClaw SkillHub Service
 *
 * Searches and installs skills via the SkillHub CLI (preferred) or ClawHub CLI (fallback).
 * Uses bundled binaries first, then well-known install paths.
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillHubEntry, SkillHubSearchResult } from '../types'
import type { ConfigService } from './config'
import type { OpenClawPaths } from './paths'

// ─── ANSI Stripping ─────────────────────────────────────────────────────────

const ESC = String.fromCharCode(27)
const CSI = String.fromCharCode(155)
const ANSI_PATTERN = `(?:${ESC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${CSI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`
const ANSI_RE = new RegExp(ANSI_PATTERN, 'g')

function stripAnsi(line: string): string {
  return line.replace(ANSI_RE, '').trim()
}

// ─── Registry Configuration ─────────────────────────────────────────────────

export interface SkillHubRegistry {
  id: string
  name: string
  url: string
  enabled: boolean
}

const DEFAULT_REGISTRIES: SkillHubRegistry[] = [
  { id: 'clawhub', name: 'ClawHub', url: 'https://clawhub.ai', enabled: true },
]

export class SkillHubService {
  private registries: SkillHubRegistry[] = [...DEFAULT_REGISTRIES]

  constructor(
    private paths: OpenClawPaths,
    private config: ConfigService,
  ) {}

  // ─── Registry Management ──────────────────────────────────────────────────

  getRegistries(): SkillHubRegistry[] {
    return this.registries
  }

  setRegistries(newRegistries: SkillHubRegistry[]): void {
    this.registries = newRegistries
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  async search(
    query: string,
    options?: { registryId?: string; page?: number; pageSize?: number; tags?: string[] },
  ): Promise<SkillHubSearchResult> {
    const installed = this.config.listInstalledSkills()
    const installedNames = new Set(installed.map((s) => s.name))
    const pageSize = options?.pageSize ?? 20

    let allSkills: SkillHubEntry[] = []

    try {
      if (query.trim()) {
        allSkills = await this.searchVia(query, pageSize)
      } else {
        allSkills = await this.exploreVia(pageSize)
      }
    } catch (err) {
      console.warn('clawhub CLI search failed:', err)
    }

    if (options?.tags?.length) {
      const tags = new Set(options.tags.map((t) => t.toLowerCase()))
      allSkills = allSkills.filter((s) => s.tags?.some((t) => tags.has(t.toLowerCase())))
    }

    for (const skill of allSkills) {
      skill.installed = installedNames.has(skill.slug)
    }

    return {
      skills: allSkills.slice(0, pageSize),
      total: allSkills.length,
      page: options?.page ?? 1,
      pageSize,
    }
  }

  // ─── Install / Uninstall ──────────────────────────────────────────────────

  async install(slug: string, _registryId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.runCli(['install', slug])
      if (result.success) return { success: true }
      return { success: false, error: result.stderr || result.stdout || 'Install failed' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  async uninstall(slug: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.runCli(['uninstall', slug])
      if (result.success) return { success: true }
    } catch {
      // Fall through to manual cleanup
    }

    const targetDir = this.paths.skillDir(slug)
    if (!existsSync(targetDir)) {
      return { success: false, error: `Skill '${slug}' is not installed` }
    }
    try {
      rmSync(targetDir, { recursive: true, force: true })
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  async leaderboard(limit = 50): Promise<SkillHubEntry[]> {
    const installed = this.config.listInstalledSkills()
    const installedNames = new Set(installed.map((s) => s.name))

    let skills: SkillHubEntry[] = []
    try {
      // Use a broad search to populate the leaderboard (skillhub CLI has no 'top' command)
      const result = await this.runCli(['search', 'all', '--json', '--search-limit', String(limit)])
      if (result.success && result.stdout.trim()) {
        skills = this.parseJsonOutput(result.stdout) ?? this.parseSearchOutput(result.stdout)
      }
    } catch {
      // ignore
    }

    // Fallback: use explore results
    if (skills.length === 0) {
      try {
        skills = await this.exploreVia(limit)
      } catch {
        // ignore
      }
    }

    for (const skill of skills) {
      skill.installed = installedNames.has(skill.slug)
    }

    return skills.slice(0, limit)
  }

  async getReadme(slug: string): Promise<string | null> {
    const readmePath = this.paths.skillManifest(slug)
    if (existsSync(readmePath)) return readFileSync(readmePath, 'utf-8')

    if (existsSync(this.paths.skillsDir)) {
      try {
        const entries = readdirSync(this.paths.skillsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const skillMd = join(this.paths.skillsDir, entry.name, 'SKILL.md')
          if (!existsSync(skillMd)) continue
          const content = readFileSync(skillMd, 'utf-8')
          const nameMatch = content.match(/^---\s*\n[\s\S]*?name\s*:\s*["']?([^"'\n]+)["']?\s*$/m)
          if (nameMatch?.[1]?.trim().toLowerCase() === slug.toLowerCase()) {
            return content
          }
        }
      } catch {
        /* ignore */
      }
    }

    return null
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Resolve CLI binary — prefer skillhub CLI, fallback to clawhub */
  private resolveCli(): {
    kind: 'skillhub' | 'clawhub'
    command: string
    prependArgs: string[]
    useNodeRunner: boolean
  } | null {
    // 1. Prefer skillhub CLI
    const skillhub = this.paths.resolveSkillHubCli()
    if (skillhub) return { kind: 'skillhub', ...skillhub }

    // 2. Fallback to clawhub CLI
    const clawhub = this.paths.resolveClawHubCli()
    if (clawhub) return { kind: 'clawhub', ...clawhub }

    return null
  }

  private async runCli(
    args: string[],
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const resolved = this.resolveCli()
    if (!resolved) {
      return { success: false, stdout: '', stderr: 'No SkillHub or ClawHub CLI available' }
    }

    return new Promise((resolve) => {
      const { command, prependArgs, useNodeRunner } = resolved
      // Inject --dir to point skillhub at our skills directory
      const commandArgs = [...prependArgs, '--dir', this.paths.skillsDir, ...args]
      const workDir = this.paths.root

      const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env
      const env: Record<string, string | undefined> = {
        ...baseEnv,
        CI: 'true',
        FORCE_COLOR: '0',
        // Set workdir for both CLI variants
        CLAWHUB_WORKDIR: workDir,
        SKILLHUB_WORKDIR: workDir,
      }
      if (useNodeRunner) {
        env.ELECTRON_RUN_AS_NODE = '1'
        env.ELECTRON_NO_ATTACH_CONSOLE = '1'
      }

      const child = spawn(command, commandArgs, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: !useNodeRunner,
        timeout: 60_000,
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr })
      })

      child.on('error', () => {
        resolve({ success: false, stdout, stderr: 'CLI not found' })
      })
    })
  }

  private async searchVia(query: string, limit: number): Promise<SkillHubEntry[]> {
    // Use --json for structured output, --search-limit for result count
    const result = await this.runCli([
      'search',
      query.trim(),
      '--json',
      '--search-limit',
      String(limit),
    ])
    if (!result.success || !result.stdout.trim()) return []
    return this.parseJsonOutput(result.stdout) ?? this.parseSearchOutput(result.stdout)
  }

  private async exploreVia(limit: number): Promise<SkillHubEntry[]> {
    // The skillhub CLI has no 'explore' command — use a broad search instead
    const result = await this.runCli(['search', 'all', '--json', '--search-limit', String(limit)])
    if (result.success && result.stdout.trim()) {
      return this.parseJsonOutput(result.stdout) ?? this.parseSearchOutput(result.stdout)
    }
    // Fallback: try a generic search
    const fallback = await this.runCli([
      'search',
      'openclaw',
      '--json',
      '--search-limit',
      String(limit),
    ])
    if (!fallback.success || !fallback.stdout.trim()) return []
    return this.parseJsonOutput(fallback.stdout) ?? this.parseSearchOutput(fallback.stdout)
  }

  /** Parse JSON output from skillhub search --json */
  private parseJsonOutput(output: string): SkillHubEntry[] | null {
    try {
      const data = JSON.parse(output.trim())
      if (data && Array.isArray(data.results)) {
        return data.results.map((r: Record<string, unknown>) => ({
          slug: String(r.slug ?? r.name ?? ''),
          name: String(r.slug ?? r.name ?? ''),
          displayName: String(r.name ?? r.slug ?? ''),
          description: String(r.description ?? r.summary ?? ''),
          author: String(r.author ?? 'unknown'),
          version: String(r.version ?? 'latest'),
          downloads: typeof r.downloads === 'number' ? r.downloads : undefined,
          rating: typeof r.rating === 'number' ? r.rating : undefined,
        }))
      }
      if (Array.isArray(data)) {
        return data.map((r: Record<string, unknown>) => ({
          slug: String(r.slug ?? r.name ?? ''),
          name: String(r.slug ?? r.name ?? ''),
          displayName: String(r.name ?? r.slug ?? ''),
          description: String(r.description ?? r.summary ?? ''),
          author: String(r.author ?? 'unknown'),
          version: String(r.version ?? 'latest'),
          downloads: typeof r.downloads === 'number' ? r.downloads : undefined,
          rating: typeof r.rating === 'number' ? r.rating : undefined,
        }))
      }
    } catch {
      // Not valid JSON
    }
    return null
  }

  private parseSearchOutput(output: string): SkillHubEntry[] {
    const lines = output.split('\n').filter((l) => l.trim())
    const skills: SkillHubEntry[] = []

    for (const rawLine of lines) {
      const line = stripAnsi(rawLine)
      if (!line || line.startsWith('No skills') || line.startsWith('Error')) continue

      const scoreMatch = line.match(/^(\S+)\s+(.+?)\s+\([\d.]+\)$/)
      if (scoreMatch) {
        skills.push({
          slug: scoreMatch[1]!,
          name: scoreMatch[1]!,
          displayName: scoreMatch[2]!.trim(),
          description: scoreMatch[2]!.trim(),
          author: 'unknown',
          version: 'latest',
        })
        continue
      }

      const versionMatch = line.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+)$/)
      if (versionMatch) {
        skills.push({
          slug: versionMatch[1]!,
          name: versionMatch[1]!,
          displayName: versionMatch[1]!.replace(/-/g, ' '),
          description: versionMatch[3]!.replace(/\([\d.]+\)$/, '').trim(),
          author: 'unknown',
          version: versionMatch[2]!,
        })
        continue
      }

      const simpleMatch = line.match(/^(\S+)\s+(.+)$/)
      if (simpleMatch) {
        skills.push({
          slug: simpleMatch[1]!,
          name: simpleMatch[1]!,
          displayName: simpleMatch[1]!.replace(/-/g, ' '),
          description: simpleMatch[2]!.replace(/\([\d.]+\)$/, '').trim(),
          author: 'unknown',
          version: 'latest',
        })
      }
    }

    return skills
  }

  private parseExploreOutput(output: string): SkillHubEntry[] {
    const lines = output.split('\n').filter((l) => l.trim())
    const skills: SkillHubEntry[] = []

    for (const rawLine of lines) {
      const line = stripAnsi(rawLine)
      if (!line || line.startsWith('No skills') || line.startsWith('Error')) continue

      const match = line.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+? ago|just now|yesterday)\s+(.+)$/i)
      if (match) {
        skills.push({
          slug: match[1]!,
          name: match[1]!,
          displayName: match[1]!.replace(/-/g, ' '),
          description: match[4]!,
          author: 'unknown',
          version: match[2]!,
        })
        continue
      }

      const parsed = this.parseSearchOutput(line)
      if (parsed.length > 0) skills.push(...parsed)
    }

    return skills
  }
}
