/**
 * GitAgent Adapter — adapts the gitagent standard (MIT) to shadowob-cloud config.
 *
 * Reads the gitagent repository layout:
 *   agent.yaml      — main agent manifest (model, tools, skills, compliance, runtime)
 *   SOUL.md         — agent personality and identity
 *   RULES.md        — hard constraints injected into system prompt
 *   AGENTS.md       — multi-agent orchestration hints
 *   INSTRUCTIONS.md — additional standing instructions
 *   skills/{name}/SKILL.md — skill definitions
 *   tools/*.yaml    — tool definitions
 *   hooks/hooks.yaml — lifecycle hooks and event triggers
 *   hooks/bootstrap.md — bootstrap prompt
 *   hooks/teardown.md  — teardown prompt
 *   skillflows/*.yaml  — deterministic multi-step workflows (SkillsFlow)
 *   memory/MEMORY.md   — memory strategy instructions
 *   scheduler.yml      — cron/event schedules
 *   compliance/regulatory-map.yaml — regulatory mapping
 *   knowledge/index.yaml — knowledge base references
 *
 * Based on the gitagent spec v0.1.0 (MIT):
 * https://github.com/open-gitagent/gitagent
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentCompliance,
  AgentDeployment,
  AgentIdentity,
  AgentModel,
  AgentWorkflowDef,
  AgentWorkflowStep,
  GitAgentHooksConfig,
  GitAgentManifest,
  GitAgentSchedulerConfig,
  OpenClawConfig,
} from '../../config/schema.js'

// ─── YAML parser (zero-dep subset) ───────────────────────────────────────────
// Handles the simple YAML subset used in gitagent files.
// For production use, replace with `js-yaml` or `yaml` package.

/**
 * Minimal single-document YAML → JS parser.
 * Handles: mappings, sequences (block and flow), scalars, quoted strings,
 * multi-line block scalars (| and >), nested indentation.
 * Does NOT handle: anchors/aliases, tags, multiple documents.
 */
function parseYaml(content: string): unknown {
  const lines = content.split('\n')
  let pos = 0

  /** Safe line access — pos is always bounds-checked before calling this. */
  const at = (i: number): string => lines[i]!

  function skipEmptyAndComments(): void {
    while (pos < lines.length) {
      const line = at(pos)
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) {
        pos++
      } else {
        break
      }
    }
  }

  function getIndent(line: string): number {
    return line.length - line.trimStart().length
  }

  function parseValue(raw: string): unknown {
    const v = raw.trim()
    if (v === 'true' || v === 'yes') return true
    if (v === 'false' || v === 'no') return false
    if (v === 'null' || v === '~' || v === '') return null
    if (/^-?\d+$/.test(v)) return Number.parseInt(v, 10)
    if (/^-?\d*\.\d+$/.test(v)) return Number.parseFloat(v)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1)
    }
    // Flow sequence [a, b, c]
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1)
      if (inner.trim() === '') return []
      return inner
        .split(',')
        .map((s) => parseValue(s.trim()))
        .filter((s) => s !== null && s !== '')
    }
    return v
  }

  function parseBlock(minIndent: number): unknown {
    skipEmptyAndComments()
    if (pos >= lines.length) return null

    const firstLine = at(pos)
    const firstIndent = getIndent(firstLine)
    if (firstIndent < minIndent) return null

    const firstTrimmed = firstLine.trim()

    // Block sequence
    if (firstTrimmed.startsWith('- ') || firstTrimmed === '-') {
      const arr: unknown[] = []
      while (pos < lines.length) {
        skipEmptyAndComments()
        if (pos >= lines.length) break
        const line = at(pos)
        const indent = getIndent(line)
        if (indent < minIndent) break
        const trimmed = line.trim()
        if (!trimmed.startsWith('-')) break

        const afterDash = trimmed.slice(1).trim()
        pos++

        if (afterDash === '') {
          // Multi-line sequence item
          arr.push(parseBlock(indent + 2))
        } else if (afterDash.includes(':')) {
          // Inline mapping inside sequence item
          const obj: Record<string, unknown> = {}
          const [k, ...rest] = afterDash.split(':')
          const v = rest.join(':').trim()
          if (v !== '') {
            obj[k!.trim()] = parseValue(v)
          }
          // Try to parse more keys at same indent
          while (pos < lines.length) {
            skipEmptyAndComments()
            if (pos >= lines.length) break
            const nextLine = at(pos)
            const nextIndent = getIndent(nextLine)
            if (nextIndent < indent + 2) break
            const nextTrimmed = nextLine.trim()
            if (!nextTrimmed.includes(':')) break
            const [nk, ...nrest] = nextTrimmed.split(':')
            const nv = nrest.join(':').trim()
            pos++
            obj[nk!.trim()] = nv !== '' ? parseValue(nv) : parseBlock(nextIndent + 2)
          }
          arr.push(Object.keys(obj).length > 1 ? obj : parseValue(afterDash))
        } else {
          arr.push(parseValue(afterDash))
        }
      }
      return arr
    }

    // Block mapping
    if (firstTrimmed.includes(':')) {
      const obj: Record<string, unknown> = {}
      while (pos < lines.length) {
        skipEmptyAndComments()
        if (pos >= lines.length) break
        const line = at(pos)
        const indent = getIndent(line)
        if (indent < minIndent) break
        const trimmed = line.trim()
        if (trimmed.startsWith('-')) break

        const colonIdx = trimmed.indexOf(':')
        if (colonIdx < 0) {
          pos++
          continue
        }

        const key = trimmed.slice(0, colonIdx).trim()
        const afterColon = trimmed.slice(colonIdx + 1).trim()
        pos++

        if (afterColon === '' || afterColon === '|' || afterColon === '>') {
          // Block scalar or nested block
          if (afterColon === '|' || afterColon === '>') {
            // Collect literal block
            const blockLines: string[] = []
            while (pos < lines.length) {
              const subLine = at(pos)
              const subIndent = getIndent(subLine)
              if (subLine.trim() === '') {
                blockLines.push('')
                pos++
                continue
              }
              if (subIndent <= indent) break
              blockLines.push(subLine.slice(indent + 2))
              pos++
            }
            obj[key] = blockLines.join('\n').trimEnd()
          } else {
            skipEmptyAndComments()
            if (pos < lines.length) {
              const nextLine = at(pos)
              const nextIndent = getIndent(nextLine)
              if (nextIndent > indent) {
                obj[key] = parseBlock(nextIndent)
              } else {
                obj[key] = null
              }
            }
          }
        } else {
          obj[key] = parseValue(afterColon)
        }
      }
      return obj
    }

    // Plain scalar at block level
    pos++
    return parseValue(firstTrimmed)
  }

  return parseBlock(0)
}

function safeParseYaml(content: string, context: string): Record<string, unknown> {
  try {
    const result = parseYaml(content)
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return {}
  } catch (err) {
    // Non-fatal parse failure — return empty and continue
    process.stderr.write(`[gitagent] YAML parse warning in ${context}: ${String(err)}\n`)
    return {}
  }
}

// ─── File readers ─────────────────────────────────────────────────────────────

function readFile(dir: string, ...parts: string[]): string | null {
  const p = join(dir, ...parts)
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf-8')
}

function listDir(dir: string, ...parts: string[]): string[] {
  const p = join(dir, ...parts)
  if (!existsSync(p)) return []
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

// ─── Parsers per file type ────────────────────────────────────────────────────

/**
 * Parse agent.yaml into a GitAgentManifest.
 */
export function parseAgentYaml(content: string): GitAgentManifest {
  const raw = safeParseYaml(content, 'agent.yaml')
  const model = raw.model as Record<string, unknown> | undefined
  const compliance = raw.compliance as Record<string, unknown> | undefined
  const supervision = (compliance?.supervision as Record<string, unknown>) ?? {}
  const recordkeeping = (compliance?.recordkeeping as Record<string, unknown>) ?? {}

  return {
    name: (raw.name as string) ?? '',
    version: raw.version as string | undefined,
    description: raw.description as string | undefined,
    model: model
      ? {
          preferred: (model.preferred as string) ?? '',
          fallbacks: (model.fallbacks as string[]) ?? undefined,
          constraints: model.constraints
            ? {
                temperature:
                  ((model.constraints as Record<string, unknown>).temperature as number) ??
                  undefined,
                max_tokens:
                  ((model.constraints as Record<string, unknown>).max_tokens as number) ??
                  undefined,
                top_p:
                  ((model.constraints as Record<string, unknown>).top_p as number) ?? undefined,
                thinking_level:
                  ((model.constraints as Record<string, unknown>).thinking_level as string) ??
                  undefined,
              }
            : undefined,
        }
      : undefined,
    skills: (raw.skills as string[]) ?? undefined,
    tools: (raw.tools as string[]) ?? undefined,
    runtime: raw.runtime as GitAgentManifest['runtime'] | undefined,
    compliance: compliance
      ? ({
          risk_tier: compliance.risk_tier,
          frameworks: (compliance.frameworks as string[]) ?? undefined,
          supervision: {
            human_in_the_loop: supervision.human_in_the_loop,
          },
          recordkeeping: {
            audit_logging: recordkeeping.audit_logging as boolean | undefined,
            retention_period: recordkeeping.retention_period as string | undefined,
          },
          model_risk: compliance.model_risk,
        } as GitAgentManifest['compliance'])
      : undefined,
    dependencies: raw.dependencies as Record<string, string> | undefined,
    agents: (raw.agents as string[]) ?? undefined,
    delegation: raw.delegation as GitAgentManifest['delegation'] | undefined,
    exports: raw.exports as Record<string, unknown> | undefined,
  }
}

/**
 * Parse SOUL.md — extracts identity/personality from the gitagent soul file.
 *
 * Expected format (sections are optional, content is free-form markdown):
 * ```
 * # Agent Name
 * ## Core Identity
 * ...
 * ## Communication Style
 * ...
 * ## Values & Principles
 * ...
 * ## Domain Expertise
 * ...
 * ```
 * Returns an AgentIdentity with the full content as personality text.
 */
export function parseSoulMd(content: string): AgentIdentity {
  const lines = content.split('\n')

  let name: string | undefined
  let personality = ''

  for (const line of lines) {
    // Extract name from first H1
    if (!name && line.startsWith('# ')) {
      name = line.slice(2).trim()
      continue
    }
    personality += `${line}\n`
  }

  // Remove leading empty lines from personality
  personality = personality.trim()

  return {
    name,
    personality: personality || undefined,
  }
}

/**
 * Parse RULES.md — extract hard constraints.
 * These are appended to the system prompt after SOUL.md content.
 */
export function parseRulesMd(content: string): string {
  return content.trim()
}

/**
 * Parse INSTRUCTIONS.md — extract additional standing instructions.
 */
export function parseInstructionsMd(content: string): string {
  return content.trim()
}

/**
 * Parse skills/SKILL_NAME/SKILL.md — extract skill metadata from frontmatter.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: code-review
 * version: 1.0.0
 * description: Performs automated code reviews
 * triggers:
 *   - pull_request
 * ---
 * # Skill content here...
 * ```
 */
export interface ParsedSkill {
  id: string
  name?: string
  version?: string
  description?: string
  triggers?: string[]
  content: string
}

export function parseSkillMd(skillId: string, content: string): ParsedSkill {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) {
    return { id: skillId, content }
  }
  const meta = safeParseYaml(fmMatch[1]!, `skills/${skillId}/SKILL.md`)
  return {
    id: skillId,
    name: (meta.name as string) ?? skillId,
    version: meta.version as string | undefined,
    description: meta.description as string | undefined,
    triggers: (meta.triggers as string[]) ?? undefined,
    content: fmMatch[2]!.trim(),
  }
}

/**
 * Parse tools/TOOL_NAME.yaml — tool definition.
 */
export interface ParsedTool {
  id: string
  name?: string
  description?: string
  type?: string
  schema?: Record<string, unknown>
}

export function parseToolYaml(toolId: string, content: string): ParsedTool {
  const raw = safeParseYaml(content, `tools/${toolId}.yaml`)
  return {
    id: toolId,
    name: (raw.name as string) ?? toolId,
    description: raw.description as string | undefined,
    type: raw.type as string | undefined,
    schema: raw.schema as Record<string, unknown> | undefined,
  }
}

/**
 * Parse hooks/hooks.yaml
 */
export function parseHooksYaml(content: string): GitAgentHooksConfig {
  const raw = safeParseYaml(content, 'hooks/hooks.yaml')
  const lifecycle = raw.lifecycle as Record<string, unknown> | undefined
  const events = raw.events as Array<Record<string, unknown>> | undefined
  return {
    lifecycle: lifecycle
      ? {
          on_start: lifecycle.on_start as string | undefined,
          on_stop: lifecycle.on_stop as string | undefined,
          on_error: lifecycle.on_error as string | undefined,
          on_reset: lifecycle.on_reset as string | undefined,
        }
      : undefined,
    events: events?.map((e) => ({
      name: (e.name as string) ?? '',
      trigger: (e.trigger as string) ?? '',
      skill: e.skill as string | undefined,
      tool: e.tool as string | undefined,
      prompt: e.prompt as string | undefined,
    })),
    bootstrap: undefined,
    teardown: undefined,
  }
}

/**
 * Parse skillflows/*.yaml — SkillsFlow multi-step workflow definition.
 *
 * Format:
 * ```yaml
 * name: code-review-flow
 * description: Automated code review workflow
 * triggers:
 *   - pull_request
 * steps:
 *   fetch:
 *     skill: fetch-pr
 *     inputs:
 *       pr_number: ${{ github.pr_number }}
 *   review:
 *     skill: code-review
 *     depends_on:
 *       - fetch
 *     inputs:
 *       code: ${{ steps.fetch.outputs.diff }}
 * ```
 */
export function parseSkillFlowYaml(content: string, filename: string): AgentWorkflowDef {
  const raw = safeParseYaml(content, filename)
  const stepsRaw = (raw.steps as Record<string, Record<string, unknown>>) ?? {}

  const steps: Record<string, AgentWorkflowStep> = {}
  for (const [stepId, stepRaw] of Object.entries(stepsRaw)) {
    if (!stepRaw || typeof stepRaw !== 'object') continue
    steps[stepId] = {
      skill: stepRaw.skill as string | undefined,
      agent: stepRaw.agent as string | undefined,
      tool: stepRaw.tool as string | undefined,
      dependsOn: (stepRaw.depends_on as string[]) ?? undefined,
      inputs: (stepRaw.inputs as Record<string, string>) ?? undefined,
      prompt: stepRaw.prompt as string | undefined,
      conditions: (stepRaw.conditions as string[]) ?? undefined,
    }
  }

  const errorHandling = raw.error_handling as Record<string, unknown> | undefined

  return {
    name: (raw.name as string) ?? filename,
    description: raw.description as string | undefined,
    triggers: (raw.triggers as string[]) ?? undefined,
    schedule: raw.schedule as string | undefined,
    steps,
    errorHandling: errorHandling
      ? {
          onFailure: errorHandling.on_failure as 'retry' | 'notify' | 'abort' | undefined,
          notifyChannel: errorHandling.notify_channel as string | undefined,
          maxRetries: errorHandling.max_retries as number | undefined,
        }
      : undefined,
  }
}

/**
 * Parse scheduler.yml
 */
export function parseSchedulerYaml(content: string): GitAgentSchedulerConfig {
  const raw = safeParseYaml(content, 'scheduler.yml')
  const schedules = raw.schedules as Array<Record<string, unknown>> | undefined
  return {
    schedules: schedules?.map((s) => ({
      name: (s.name as string) ?? '',
      cron: s.cron as string | undefined,
      interval: s.interval as string | undefined,
      skill: s.skill as string | undefined,
      tool: s.tool as string | undefined,
      prompt: s.prompt as string | undefined,
      enabled: s.enabled as boolean | undefined,
    })),
  }
}

// ─── Full directory reader ────────────────────────────────────────────────────

export interface ParsedGitAgent {
  manifest?: GitAgentManifest
  soul?: AgentIdentity
  rules?: string
  instructions?: string
  agents?: string
  skills: ParsedSkill[]
  tools: ParsedTool[]
  hooks?: GitAgentHooksConfig
  bootstrapPrompt?: string
  teardownPrompt?: string
  skillFlows: AgentWorkflowDef[]
  scheduler?: GitAgentSchedulerConfig
  memoryInstructions?: string
  /** Raw directory path that was read */
  dir: string
}

/**
 * Read and parse all gitagent standard files from a local directory.
 * Non-existent files are silently skipped.
 */
export function readGitAgentDir(dir: string): ParsedGitAgent {
  const parsed: ParsedGitAgent = {
    skills: [],
    tools: [],
    skillFlows: [],
    dir,
  }

  // agent.yaml (required by spec, but we handle missing gracefully)
  const agentYaml = readFile(dir, 'agent.yaml')
  if (agentYaml) parsed.manifest = parseAgentYaml(agentYaml)

  // SOUL.md
  const soulMd = readFile(dir, 'SOUL.md')
  if (soulMd) parsed.soul = parseSoulMd(soulMd)

  // RULES.md
  const rulesMd = readFile(dir, 'RULES.md')
  if (rulesMd) parsed.rules = parseRulesMd(rulesMd)

  // INSTRUCTIONS.md
  const instructionsMd = readFile(dir, 'INSTRUCTIONS.md')
  if (instructionsMd) parsed.instructions = parseInstructionsMd(instructionsMd)

  // AGENTS.md
  const agentsMd = readFile(dir, 'AGENTS.md')
  if (agentsMd) parsed.agents = agentsMd.trim()

  // skills/*/SKILL.md
  for (const skillDir of listDir(dir, 'skills')) {
    const skillMd = readFile(dir, 'skills', skillDir, 'SKILL.md')
    if (skillMd) {
      parsed.skills.push(parseSkillMd(skillDir, skillMd))
    }
  }

  // tools/*.yaml
  for (const toolFile of listDir(dir, 'tools')) {
    if (!toolFile.endsWith('.yaml') && !toolFile.endsWith('.yml')) continue
    const toolContent = readFile(dir, 'tools', toolFile)
    if (toolContent) {
      const toolId = toolFile.replace(/\.(ya?ml)$/, '')
      parsed.tools.push(parseToolYaml(toolId, toolContent))
    }
  }

  // hooks/hooks.yaml
  const hooksYaml = readFile(dir, 'hooks', 'hooks.yaml')
  if (hooksYaml) {
    parsed.hooks = parseHooksYaml(hooksYaml)
    parsed.hooks.bootstrap = readFile(dir, 'hooks', 'bootstrap.md') ?? undefined
    parsed.hooks.teardown = readFile(dir, 'hooks', 'teardown.md') ?? undefined
  } else {
    const bootstrap = readFile(dir, 'hooks', 'bootstrap.md')
    const teardown = readFile(dir, 'hooks', 'teardown.md')
    if (bootstrap || teardown) {
      parsed.hooks = { bootstrap: bootstrap ?? undefined, teardown: teardown ?? undefined }
    }
  }

  // skillflows/*.yaml
  for (const sfFile of listDir(dir, 'skillflows')) {
    if (!sfFile.endsWith('.yaml') && !sfFile.endsWith('.yml')) continue
    const sfContent = readFile(dir, 'skillflows', sfFile)
    if (sfContent) {
      parsed.skillFlows.push(parseSkillFlowYaml(sfContent, sfFile))
    }
  }

  // scheduler.yml / scheduler.yaml
  const schedulerYml = readFile(dir, 'scheduler.yml') ?? readFile(dir, 'scheduler.yaml')
  if (schedulerYml) parsed.scheduler = parseSchedulerYaml(schedulerYml)

  // memory/MEMORY.md
  const memoryMd = readFile(dir, 'memory', 'MEMORY.md')
  if (memoryMd) parsed.memoryInstructions = memoryMd.trim()

  return parsed
}

// ─── Adapter: ParsedGitAgent → shadowob-cloud types ────────────────────────────

/**
 * Map a parsed gitagent directory to an AgentModel.
 * Returns undefined if no model info is present.
 */
export function adaptGitAgentModel(manifest: GitAgentManifest): AgentModel | undefined {
  if (!manifest.model?.preferred) return undefined
  const m = manifest.model
  return {
    preferred: m.preferred,
    fallbacks: m.fallbacks,
    constraints: m.constraints
      ? {
          temperature: m.constraints.temperature,
          maxTokens: m.constraints.max_tokens,
          topP: m.constraints.top_p,
          thinkingLevel: m.constraints.thinking_level as
            | 'off'
            | 'minimal'
            | 'low'
            | 'medium'
            | 'high'
            | 'xhigh'
            | 'adaptive'
            | undefined,
        }
      : undefined,
  }
}

/**
 * Map a parsed gitagent directory to an AgentCompliance.
 */
export function adaptGitAgentCompliance(manifest: GitAgentManifest): AgentCompliance | undefined {
  if (!manifest.compliance) return undefined
  const c = manifest.compliance
  return {
    riskTier: c.risk_tier,
    frameworks: c.frameworks,
    humanInTheLoop: c.supervision?.human_in_the_loop as AgentCompliance['humanInTheLoop'],
    auditLogging: c.recordkeeping?.audit_logging,
    retentionPeriod: c.recordkeeping?.retention_period,
  }
}

/**
 * Build the system prompt from a parsed gitagent directory.
 * Concatenates: SOUL.md personality + RULES.md hard constraints +
 * INSTRUCTIONS.md standing instructions + memory instructions.
 */
export function buildSystemPromptFromGitAgent(
  parsed: ParsedGitAgent,
  existingPrompt?: string,
): string {
  const parts: string[] = []

  // SOUL.md — personality / identity
  if (parsed.soul?.personality) {
    parts.push(parsed.soul.personality)
  }

  // RULES.md — hard constraints
  if (parsed.rules) {
    parts.push(`---\n## Hard Rules\n\n${parsed.rules}`)
  }

  // INSTRUCTIONS.md — standing instructions
  if (parsed.instructions) {
    parts.push(`---\n## Standing Instructions\n\n${parsed.instructions}`)
  }

  // Memory instructions
  if (parsed.memoryInstructions) {
    parts.push(`---\n## Memory Strategy\n\n${parsed.memoryInstructions}`)
  }

  // Bootstrap hook as context
  if (parsed.hooks?.bootstrap) {
    parts.push(`---\n## Startup Procedure\n\n${parsed.hooks.bootstrap}`)
  }

  // Any existing prompt gets appended last
  if (existingPrompt) {
    parts.push(`---\n${existingPrompt}`)
  }

  return parts.join('\n\n').trim()
}

/**
 * Enrich an existing AgentDeployment with data from a parsed gitagent directory.
 * Only fills in fields that aren't already set (non-destructive merge).
 */
export function enrichAgentFromGitAgent(
  agent: AgentDeployment,
  parsed: ParsedGitAgent,
): AgentDeployment {
  const enriched = { ...agent }

  // Identity — fill from SOUL.md
  if (parsed.soul) {
    enriched.identity = {
      name: agent.identity?.name ?? parsed.soul.name,
      description: agent.identity?.description ?? parsed.manifest?.description,
      personality: agent.identity?.personality ?? parsed.soul.personality,
      systemPrompt: agent.identity?.systemPrompt,
    }
  }

  // Description from manifest
  if (!enriched.description && parsed.manifest?.description) {
    enriched.description = parsed.manifest.description
  }

  // Model from agent.yaml
  if (!enriched.model && parsed.manifest) {
    enriched.model = adaptGitAgentModel(parsed.manifest) ?? enriched.model
  }

  // Compliance from agent.yaml
  if (!enriched.compliance && parsed.manifest) {
    enriched.compliance = adaptGitAgentCompliance(parsed.manifest) ?? enriched.compliance
  }

  // Workflows from skillflows/*.yaml
  if (!enriched.workflows?.length && parsed.skillFlows.length > 0) {
    enriched.workflows = parsed.skillFlows
  }

  return enriched
}

/**
 * Build OpenClaw config additions from a parsed gitagent directory.
 * Returns a partial OpenClaw config that can be merged with the existing one.
 */
export function buildOpenClawFromGitAgent(
  parsed: ParsedGitAgent,
  mountPath: string,
): Partial<OpenClawConfig> {
  const result: Partial<OpenClawConfig> = {}

  // agentDir — tells OpenClaw where to read SOUL.md, RULES.md, skills/, etc.
  // This is the core of the runtime integration: OpenClaw natively reads
  // the gitagent layout when agentDir is configured.
  result.agents = {
    defaults: {
      repoRoot: mountPath,
    },
  }

  // Skills entries from skills/*/SKILL.md
  if (parsed.skills.length > 0) {
    result.skills = {
      load: { extraDirs: [join(mountPath, 'skills')] },
      entries: Object.fromEntries(
        parsed.skills.map((s) => [
          s.id,
          {
            enabled: true,
          },
        ]),
      ),
    }
  }

  // Hooks — map to OpenClaw plugins/events
  // Note: hooks are primarily handled by OpenClaw reading from agentDir directly
  // when repoRoot is configured. We also map them to the heartbeat config
  // if schedule information is present.
  if (parsed.scheduler?.schedules?.length) {
    const firstSchedule = parsed.scheduler.schedules[0]!
    if (firstSchedule.cron || firstSchedule.interval) {
      if (!result.agents) result.agents = {}
      if (!result.agents.defaults) result.agents.defaults = {}
      result.agents.defaults.heartbeat = {
        every: firstSchedule.interval ?? firstSchedule.cron!,
        prompt: firstSchedule.prompt ?? `Run scheduled task: ${firstSchedule.name}`,
      }
    }
  }

  return result
}
