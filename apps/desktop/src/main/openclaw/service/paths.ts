/**
 * OpenClaw Path Resolver
 *
 * Centralizes ALL path resolution for the built-in OpenClaw instance.
 * Every file read/write must go through this module to guarantee isolation
 * from any system-installed OpenClaw.
 *
 * Data directory: ~/.shadowob (OPENCLAW_DIR)
 * This is the ONLY source of truth for path resolution.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * On macOS, resolve the Electron Helper binary so child processes spawned with
 * ELECTRON_RUN_AS_NODE do not create extra Dock icons.
 * Falls back to process.execPath on non-macOS or when the Helper is not found.
 */
export function resolveElectronNodeBinary(): string {
  if (process.platform !== 'darwin') return process.execPath

  const contentsDir = dirname(dirname(app.getPath('exe')))
  const frameworksDir = join(contentsDir, 'Frameworks')

  // First try known names based on app.getName() and the Electron default
  const knownNames = [`${app.getName()} Helper`, 'Shadow Helper', 'Electron Helper']
  for (const name of knownNames) {
    const helper = join(frameworksDir, `${name}.app`, 'Contents', 'MacOS', name)
    if (existsSync(helper)) return helper
  }

  // Scan the Frameworks directory for any Helper binary as a last resort
  if (existsSync(frameworksDir)) {
    try {
      const entry = readdirSync(frameworksDir).find(
        (e) => e.endsWith(' Helper.app') && !e.includes('('),
      )
      if (entry) {
        const name = entry.replace('.app', '')
        const helper = join(frameworksDir, entry, 'Contents', 'MacOS', name)
        if (existsSync(helper)) return helper
      }
    } catch {
      // Best effort — fall through to process.execPath
    }
  }

  return process.execPath
}

/** Root data directory for the built-in OpenClaw instance */
const OPENCLAW_DIR = join(homedir(), '.shadowob')

export class OpenClawPaths {
  /** Root data directory (~/.shadowob) */
  readonly root: string
  /** Config file path (~/.shadowob/openclaw.json) */
  readonly configFile: string
  /** Skills directory (~/.shadowob/skills) */
  readonly skillsDir: string
  /** Extensions directory (~/.shadowob/extensions) */
  readonly extensionsDir: string
  /** Workspace directory (~/.shadowob/workspace) */
  readonly workspaceDir: string
  /** State directory (~/.shadowob/state) — isolated sessions, creds, caches */
  readonly stateDir: string
  /** Cron directory (~/.shadowob/cron) */
  readonly cronDir: string
  /** Cron jobs file (~/.shadowob/cron/jobs.json) */
  readonly cronJobsFile: string
  /** Buddy connections file (~/.shadowob/buddy-connections.json) */
  readonly buddyConnectionsFile: string
  /** Desktop-only settings file (~/.shadowob/desktop-settings.json) */
  readonly desktopSettingsFile: string

  constructor() {
    this.root = OPENCLAW_DIR
    this.configFile = join(OPENCLAW_DIR, 'openclaw.json')
    this.skillsDir = join(OPENCLAW_DIR, 'skills')
    this.extensionsDir = join(OPENCLAW_DIR, 'extensions')
    this.workspaceDir = join(OPENCLAW_DIR, 'workspace')
    this.stateDir = join(OPENCLAW_DIR, 'state')
    this.cronDir = join(OPENCLAW_DIR, 'cron')
    this.cronJobsFile = join(OPENCLAW_DIR, 'cron', 'jobs.json')
    this.buddyConnectionsFile = join(OPENCLAW_DIR, 'buddy-connections.json')
    this.desktopSettingsFile = join(OPENCLAW_DIR, 'desktop-settings.json')
  }

  /** Ensure all required directories exist with restricted permissions */
  ensureDirs(): void {
    for (const dir of [
      this.root,
      this.skillsDir,
      this.extensionsDir,
      this.workspaceDir,
      this.stateDir,
      this.cronDir,
    ]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 })
      } else {
        try {
          chmodSync(dir, 0o700)
        } catch {
          /* best effort */
        }
      }
    }

    // Create workspace/openclaw.json if missing — prevents ENOENT from gateway tools
    const workspaceConfig = join(this.workspaceDir, 'openclaw.json')
    if (!existsSync(workspaceConfig)) {
      writeFileSync(workspaceConfig, '{}', { mode: 0o600 })
    }
  }

  /** Agent workspace directory for a specific agent */
  agentDir(agentId: string): string {
    return join(this.workspaceDir, agentId)
  }

  /** Bootstrap file path for a specific agent */
  bootstrapFile(agentId: string, fileName: string): string {
    return join(this.agentDir(agentId), fileName)
  }

  /** Skill directory for a specific skill */
  skillDir(slug: string): string {
    return join(this.skillsDir, slug)
  }

  /** SKILL.md manifest path for a specific skill */
  skillManifest(slug: string): string {
    return join(this.skillsDir, slug, 'SKILL.md')
  }

  // ─── Package Resolution ─────────────────────────────────────────────────

  /**
   * Resolve the local build directory (apps/desktop/build/).
   * In dev mode, the bundle script produces build/openclaw and build/shadowob
   * BEFORE Electron starts. In packaged apps, process.resourcesPath takes precedence.
   */
  private get buildDir(): string {
    return join(app.getAppPath(), 'build')
  }

  /**
   * Resolve the bundled OpenClaw package location.
   * Search order:
   *   1. Packaged app extraResources/openclaw (production)
   *   2. Local build/openclaw (dev — produced by bundle-openclaw.mjs)
   *
   * NEVER falls back to pnpm/node_modules or system-installed OpenClaw.
   */
  resolveOpenClawPackage(subpath?: string): string | null {
    // 1. Packaged app resources
    if (process.resourcesPath) {
      const bundledDir = join(process.resourcesPath, 'openclaw')
      if (existsSync(bundledDir)) {
        return subpath ? join(bundledDir, subpath) : bundledDir
      }
    }

    // 2. Dev build directory
    const devDir = join(this.buildDir, 'openclaw')
    if (existsSync(devDir)) {
      return subpath ? join(devDir, subpath) : devDir
    }

    return null
  }

  /**
   * Resolve the Shadow channel plugin (@shadowob/openclaw-shadowob) directory.
   * This is the PLUGIN that OpenClaw loads, not the core OpenClaw package.
   * Used for plugins.load.paths in openclaw.json.
   *
   * Search order:
   *   1. Packaged app extraResources/shadowob (production)
   *   2. Local build/shadowob (dev — produced by bundle-openclaw.mjs)
   *
   * NEVER falls back to pnpm/node_modules or monorepo source.
   */
  resolveShadowPlugin(): string | null {
    // 1. Packaged app resources
    if (process.resourcesPath) {
      const bundledDir = join(process.resourcesPath, 'shadowob')
      if (existsSync(bundledDir)) return bundledDir
    }

    // 2. Dev build directory
    const devDir = join(this.buildDir, 'shadowob')
    if (existsSync(devDir)) return devDir

    return null
  }

  /**
   * Resolve the ClawHub CLI binary location.
   * NEVER falls back to system-installed clawhub.
   */
  resolveClawHubCli(): { command: string; prependArgs: string[]; useNodeRunner: boolean } | null {
    // 1. Packaged app resources
    if (process.resourcesPath) {
      const bundledBin = join(process.resourcesPath, 'clawhub', 'clawhub.mjs')
      if (existsSync(bundledBin)) {
        return {
          command: resolveElectronNodeBinary(),
          prependArgs: [bundledBin],
          useNodeRunner: true,
        }
      }
    }

    // 2. From the bundled openclaw package's node_modules/.bin
    const pkgRoot = this.resolveOpenClawPackage()
    if (pkgRoot) {
      const clawHubBin = join(pkgRoot, 'node_modules', '.bin', 'clawhub')
      if (existsSync(clawHubBin)) {
        return { command: clawHubBin, prependArgs: [], useNodeRunner: false }
      }
    }

    return null
  }

  /**
   * Resolve the SkillHub CLI binary location.
   * Searches bundled locations first, then well-known install paths.
   */
  resolveSkillHubCli(): { command: string; prependArgs: string[]; useNodeRunner: boolean } | null {
    // 1. Packaged app resources
    if (process.resourcesPath) {
      const bundledBin = join(process.resourcesPath, 'skillhub', 'skillhub.mjs')
      if (existsSync(bundledBin)) {
        return {
          command: resolveElectronNodeBinary(),
          prependArgs: [bundledBin],
          useNodeRunner: true,
        }
      }
    }

    // 2. Well-known install paths (installed via skillhub install script)
    const homeDir = homedir()
    const candidates = [join(homeDir, '.local', 'bin', 'skillhub'), '/usr/local/bin/skillhub']
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return { command: candidate, prependArgs: [], useNodeRunner: false }
      }
    }

    return null
  }

  /**
   * Resolve the gateway entry point (CLI script).
   * NEVER falls back to pnpm/node_modules or system-installed openclaw binary.
   */
  resolveGatewayEntry(): string | null {
    // 1. Packaged app resources
    if (process.resourcesPath) {
      const bundledCli = join(process.resourcesPath, 'openclaw', 'dist', 'cli', 'index.js')
      if (existsSync(bundledCli)) return bundledCli

      const bundledMain = join(process.resourcesPath, 'openclaw', 'openclaw.mjs')
      if (existsSync(bundledMain)) return bundledMain
    }

    // 2. From resolved build package (dev or production)
    const pkgDir = this.resolveOpenClawPackage()
    if (pkgDir) {
      try {
        const { readFileSync } = require('node:fs')
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
        const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.openclaw
        const entry = binEntry || pkg.main || 'index.js'
        const entryPath = join(pkgDir, entry)
        if (existsSync(entryPath)) return entryPath
      } catch {
        // Ignore parse errors
      }
    }

    // NEVER fall back to system PATH — return null
    return null
  }

  /** Build environment variables scoped to this built-in instance */
  buildGatewayEnv(
    port: number,
    token: string,
    extraEnv?: Record<string, string>,
  ): Record<string, string> {
    // Strip any system-level OPENCLAW_* env vars to prevent leakage
    const baseEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('OPENCLAW_') && value !== undefined) {
        baseEnv[key] = value
      }
    }

    return {
      ...baseEnv,
      // OPENCLAW_DATA_DIR — the master data directory.
      // Without this, the gateway defaults to ~/.openclaw-{profile} which creates
      // a duplicate data dir alongside our ~/.shadowob.
      OPENCLAW_DATA_DIR: this.root,
      // Per https://docs.openclaw.ai/gateway/multiple-gateways:
      // OPENCLAW_CONFIG_PATH — path to the config file (not OPENCLAW_CONFIG)
      OPENCLAW_CONFIG_PATH: this.configFile,
      // OPENCLAW_STATE_DIR — isolated state (sessions, creds, caches)
      OPENCLAW_STATE_DIR: this.stateDir,
      // OPENCLAW_PROFILE — profile name for automatic isolation scoping
      OPENCLAW_PROFILE: 'shadowob',
      OPENCLAW_WORKSPACE: this.workspaceDir,
      OPENCLAW_GATEWAY_PORT: String(port),
      OPENCLAW_GATEWAY_TOKEN: token,
      OPENCLAW_SKILLS_DIR: this.skillsDir,
      OPENCLAW_EXTENSIONS_DIR: this.extensionsDir,
      NODE_ENV: 'production',
      ...extraEnv,
    }
  }
}
