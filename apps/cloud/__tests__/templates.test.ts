import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { planRuntimeTopology } from '../src/application/runtime-topology.js'
import type { CloudConfig } from '../src/config/schema.js'
import { resolvePacks } from '../src/plugins/agent-pack/index.js'
import { parseJsonc } from '../src/utils/jsonc.js'

const templatesDir = resolve(fileURLToPath(import.meta.url), '..', '..', 'templates')

/** Flat legacy files: *.template.json */
const templateFiles = readdirSync(templatesDir).filter((f) => f.endsWith('.template.json'))

/** Folder-based templates: subdirs containing shadowob-cloud.json */
const folderTemplates = readdirSync(templatesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(templatesDir, e.name, 'shadowob-cloud.json')))
  .map((e) => e.name)
const describeFolderTemplates = folderTemplates.length > 0 ? describe : describe.skip

describe('template-schema consistency (TPL-02)', () => {
  it.each(templateFiles)('%s is valid JSON/JSONC', (file) => {
    const content = readFileSync(resolve(templatesDir, file), 'utf-8')
    expect(() => parseJsonc(content, file)).not.toThrow()
  })

  it.each(templateFiles)('%s has required metadata fields', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    // version is required
    expect(content).toHaveProperty('version')
    expect(typeof content.version).toBe('string')
    expect(content.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(content).not.toHaveProperty('team')
    const i18n = content.i18n as Record<string, Record<string, string>> | undefined
    expect(i18n?.en?.title).toBeTruthy()
    expect(i18n?.['zh-CN']?.title).toBeTruthy()
    expect(content.title).toBe(i18n?.en?.title)
    expect(content.description).toBe(i18n?.en?.description)
    expect(String(content.title)).not.toContain('${i18n:')
    expect(String(content.description)).not.toContain('${i18n:')
  })

  it.each(templateFiles)('%s has deployments.agents array', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    expect(content).toHaveProperty('deployments')
    expect(content.deployments as Record<string, unknown>).toHaveProperty('agents')
    expect(Array.isArray((content.deployments as Record<string, unknown>).agents)).toBe(true)
  })

  it.each(templateFiles)('%s agents have id and runtime', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    for (const agent of (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >) {
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('runtime')
      expect(typeof agent.id).toBe('string')
      expect(['openclaw', 'claude-code', 'codex', 'opencode', 'hermes']).toContain(agent.runtime)
      expect(agent).toHaveProperty('configuration')
      expect(agent.configuration).toBeTruthy()
      expect(typeof agent.configuration).toBe('object')
    }
  })

  it.each(templateFiles)('%s agents have no inline API keys', (file) => {
    const raw = readFileSync(resolve(templatesDir, file), 'utf-8')
    // No hardcoded API keys
    expect(raw).not.toMatch(/sk-ant-api\d+-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/sk-proj-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/gsk_[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/xai-[a-zA-Z0-9]+/)
  })

  it.each(templateFiles)('%s agents have resource limits', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    for (const agent of (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >) {
      if (agent.resources) {
        expect(agent.resources).toHaveProperty('limits')
        expect((agent.resources as Record<string, unknown>).limits).toHaveProperty('memory')
      }
    }
  })
})

describeFolderTemplates('folder-based template consistency (TPL-03)', () => {
  it.each(folderTemplates)('%s/shadowob-cloud.json is valid JSON/JSONC', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = readFileSync(file, 'utf-8')
    expect(() => parseJsonc(content, file)).not.toThrow()
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json has required metadata fields', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = parseJsonc<Record<string, unknown>>(readFileSync(file, 'utf-8'), file)
    expect(content).toHaveProperty('version')
    expect(typeof content.version).toBe('string')
    expect(content.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(content).not.toHaveProperty('team')
    const i18n = content.i18n as Record<string, Record<string, string>> | undefined
    expect(i18n?.en?.title).toBeTruthy()
    expect(i18n?.['zh-CN']?.title).toBeTruthy()
    expect(content.title).toBe(i18n?.en?.title)
    expect(content.description).toBe(i18n?.en?.description)
    expect(String(content.title)).not.toContain('${i18n:')
    expect(String(content.description)).not.toContain('${i18n:')
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json has deployments.agents array', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = parseJsonc<Record<string, unknown>>(readFileSync(file, 'utf-8'), file)
    expect(content).toHaveProperty('deployments')
    expect(content.deployments as Record<string, unknown>).toHaveProperty('agents')
    expect(Array.isArray((content.deployments as Record<string, unknown>).agents)).toBe(true)
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json agents have no inline API keys', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const raw = readFileSync(file, 'utf-8')
    expect(raw).not.toMatch(/sk-ant-api\d+-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/sk-proj-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/gsk_[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/xai-[a-zA-Z0-9]+/)
  })
})

function readFlatTemplate(file: string): Record<string, unknown> {
  return parseJsonc<Record<string, unknown>>(
    readFileSync(resolve(templatesDir, file), 'utf-8'),
    file,
  )
}

function readAgentPackMounts(file: string): Array<{ kind: string; from: string }> {
  const content = readFlatTemplate(file)
  const deployments = content.deployments as Record<string, unknown>
  const agents = deployments.agents as Array<Record<string, unknown>>
  const firstAgent = agents[0]!
  const agentUse = (firstAgent.use ?? []) as Array<Record<string, unknown>>
  const agentPack = agentUse.find((entry) => entry.plugin === 'agent-pack')!
  const options = agentPack.options as Record<string, unknown>
  const packs = resolvePacks(options)
  return packs[0]!.mounts.map((mount) => ({
    kind: String(mount.kind),
    from: String(mount.from),
  }))
}

function readFirstAgentPackOptions(file: string): Record<string, unknown> {
  const content = readFlatTemplate(file)
  const deployments = content.deployments as Record<string, unknown>
  const agents = deployments.agents as Array<Record<string, unknown>>
  const firstAgent = agents[0]!
  const agentUse = (firstAgent.use ?? []) as Array<Record<string, unknown>>
  const agentPack = agentUse.find((entry) => entry.plugin === 'agent-pack')!
  return agentPack.options as Record<string, unknown>
}

describe('code trainer template', () => {
  it('greets learners from every provisioned learning channel', () => {
    const content = readFlatTemplate('code-trainer.template.json')
    const use = content.use as Array<Record<string, unknown>>
    const shadowob = use.find((entry) => entry.plugin === 'shadowob')!
    const options = shadowob.options as Record<string, unknown>
    const greeting = options.greeting as Record<string, unknown>
    const messages = greeting.messages as Array<Record<string, unknown>>

    expect(greeting.entryChannelId).toBe('learning-plan')
    expect(messages).toHaveLength(6)
    expect(messages.map((message) => message.channelId).sort()).toEqual([
      'algorithm-tips',
      'assistant-news',
      'code-review',
      'learning-plan',
      'problem-recommendations',
      'wrong-problems',
    ])
    expect(messages.find((message) => message.channelId === 'learning-plan')?.content).toContain(
      '{userName}',
    )
  })
})

describe('community pack template mounts', () => {
  it('gstack-buddy mounts the OpenClaw-native gstack artifacts', () => {
    expect(readAgentPackMounts('gstack-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'openclaw/skills' },
        { kind: 'instructions', from: 'openclaw' },
      ]),
    )
  })

  it('gstack-buddy relies on agent-pack slash command auto-discovery', () => {
    const options = readFirstAgentPackOptions('gstack-buddy.template.json')
    expect(options.slashCommands).toBeUndefined()
  })

  it('seomachine-buddy mounts Claude commands, agents, and context docs', () => {
    expect(readAgentPackMounts('seomachine-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'commands', from: '.claude/commands' },
        { kind: 'agents', from: '.claude/agents' },
        { kind: 'instructions', from: '.claude/commands' },
        { kind: 'instructions', from: '.claude/agents' },
        { kind: 'instructions', from: 'context' },
      ]),
    )
  })

  it('slavingia-skills-buddy mounts the actual skills directory', () => {
    expect(readAgentPackMounts('slavingia-skills-buddy.template.json')).toEqual(
      expect.arrayContaining([{ kind: 'skills', from: 'skills' }]),
    )
  })

  it('superpowers-buddy imports standard skills plus root Claude plugin agents', () => {
    expect(readAgentPackMounts('superpowers-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'skills' },
        { kind: 'commands', from: 'commands' },
        { kind: 'agents', from: 'agents' },
      ]),
    )
  })

  it('gsd-buddy mounts command, agent, script, and context assets', () => {
    expect(readAgentPackMounts('gsd-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'commands', from: 'commands' },
        { kind: 'agents', from: 'agents' },
        { kind: 'scripts', from: 'bin' },
        { kind: 'instructions', from: 'docs' },
        { kind: 'files', from: 'get-shit-done' },
      ]),
    )
  })

  it('bmad-method-buddy mounts BMAD native skill trees explicitly', () => {
    expect(readAgentPackMounts('bmad-method-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'src/bmm-skills' },
        { kind: 'skills', from: 'src/core-skills' },
        { kind: 'instructions', from: 'docs' },
      ]),
    )
  })

  it('agent-marketplace-buddy mounts nested plugin marketplace assets', () => {
    expect(readAgentPackMounts('agent-marketplace-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'plugins' },
        { kind: 'commands', from: 'plugins' },
        { kind: 'agents', from: 'plugins' },
        { kind: 'instructions', from: 'docs' },
      ]),
    )
  })

  it('superclaude-buddy mounts the packaged SuperClaude plugin assets', () => {
    expect(readAgentPackMounts('superclaude-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'plugins/superclaude/skills' },
        { kind: 'commands', from: 'plugins/superclaude/commands' },
        { kind: 'agents', from: 'plugins/superclaude/agents' },
        { kind: 'mcp', from: 'plugins/superclaude/.mcp.json' },
      ]),
    )
  })

  it('scientific-skills-buddy mounts the scientific skills collection', () => {
    expect(readAgentPackMounts('scientific-skills-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'scientific-skills' },
        { kind: 'instructions', from: 'docs' },
      ]),
    )
  })

  it('claude-seo and claude-ads buddies mount root subagents plus domain docs', () => {
    expect(readAgentPackMounts('claude-seo-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'agents', from: 'agents' },
        { kind: 'scripts', from: 'scripts' },
        { kind: 'instructions', from: 'docs' },
      ]),
    )
    expect(readAgentPackMounts('claude-ads-buddy.template.json')).toEqual(
      expect.arrayContaining([
        { kind: 'agents', from: 'agents' },
        { kind: 'instructions', from: 'ads/references' },
        { kind: 'instructions', from: 'research' },
      ]),
    )
  })

  it('google-workspace-buddy enables the Google Workspace plugin', () => {
    const content = readFlatTemplate('google-workspace-buddy.template.json')
    const globalUse = (content.use ?? []) as Array<{
      plugin: string
      options?: Record<string, unknown>
    }>
    const googleWorkspace = globalUse.find((entry) => entry.plugin === 'google-workspace')
    expect(googleWorkspace).toEqual({ plugin: 'google-workspace' })
    expect(content.deployments.agents[0].identity).toMatchObject({
      name: 'Workspace Buddy',
      description: expect.stringContaining('Workspace operations partner'),
    })
    expect(content.deployments.agents[0].configuration.openclaw.agents.list[0].identity).toEqual({
      name: 'Workspace Buddy',
      theme: 'Calm, audit-friendly Workspace operations partner.',
      emoji: '📎',
    })
    expect(content.deployments.agents[0].env).toBeUndefined()
  })

  it('code-trainer provisions one training buddy, learning channels, routines, and scoped Space App grants', () => {
    const content = readFlatTemplate('code-trainer.template.json')
    const shadowob = ((content.use as Array<Record<string, unknown>>).find(
      (entry) => entry.plugin === 'shadowob',
    )?.options ?? {}) as Record<string, unknown>
    const server = ((shadowob.servers as Array<Record<string, unknown>>)[0] ?? {}) as Record<
      string,
      unknown
    >
    const channels = server.channels as Array<Record<string, unknown>>
    const buddies = shadowob.buddies as Array<Record<string, unknown>>
    const bindings = shadowob.bindings as Array<Record<string, unknown>>
    const spaceApp = (shadowob.spaceApps as Array<Record<string, unknown>>)[0] as Record<
      string,
      unknown
    >
    const grants = spaceApp.grants as Array<Record<string, unknown>>
    const routines = content.routines as Array<Record<string, unknown>>
    const routineDeliveries = shadowob.routines as Array<Record<string, unknown>>
    const greeting = shadowob.greeting as {
      entryChannelId?: string
      messages?: Array<Record<string, unknown>>
    }
    const agents = (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >

    expect(channels.map((channel) => channel.id)).toEqual([
      'assistant-news',
      'problem-recommendations',
      'learning-plan',
      'code-review',
      'wrong-problems',
      'algorithm-tips',
    ])
    expect(buddies.map((buddy) => buddy.name)).toEqual(['算法教练'])
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      targetId: 'code-trainer-buddy',
      agentId: 'code-trainer-buddy',
      channels: [
        'assistant-news',
        'problem-recommendations',
        'learning-plan',
        'code-review',
        'wrong-problems',
        'algorithm-tips',
      ],
    })
    expect(agents.map((agent) => agent.id)).toEqual(['code-trainer-buddy'])
    expect(routines.map((routine) => routine.id)).toEqual([
      'sync-submissions',
      'recommend-next-problem',
      'refresh-learning-plan',
      'push-algorithm-tip',
      'wrong-problem-review',
      'generate-progress-report',
      'detect-learning-risk',
      'weekly-problem-quality-check',
    ])
    expect(routineDeliveries.map((delivery) => delivery.routineId).sort()).toEqual(
      routines.map((routine) => routine.id).sort(),
    )
    expect(greeting.entryChannelId).toBe('learning-plan')
    expect(greeting.messages?.map((message) => message.channelId)).toEqual([
      'assistant-news',
      'problem-recommendations',
      'learning-plan',
      'code-review',
      'wrong-problems',
      'algorithm-tips',
    ])
    expect(
      greeting.messages?.find((message) => message.id === 'code-review-welcome'),
    ).toMatchObject({
      buddyId: 'code-trainer-buddy',
      content: expect.stringContaining('先确认收到'),
    })
    expect(routines.find((routine) => routine.id === 'sync-submissions')).toMatchObject({
      prompt: expect.stringContaining('acknowledgement'),
      agentId: 'code-trainer-buddy',
    })
    expect(agents.find((agent) => agent.id === 'code-trainer-buddy')?.identity).toMatchObject({
      name: '算法教练',
      systemPrompt: expect.stringContaining('Use channels as modes'),
    })
    expect(spaceApp).toMatchObject({
      id: 'code-trainer-space-app',
      serverId: 'code-trainer-server',
      manifestUrl: '${env:CODE_TRAINER_MANIFEST_URL}',
    })
    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buddyId: 'code-trainer-buddy',
          permissions: expect.arrayContaining([
            'trainer.challenges:write',
            'trainer.submissions:analyze',
            'trainer.learning:read',
            'trainer.learning:write',
          ]),
        }),
      ]),
    )
    expect(grants).toHaveLength(1)
  })

  it('video-workshop provisions a reusable multi-Buddy Kanban video team', () => {
    const content = readFlatTemplate('video-workshop.template.json')
    const shadowob = ((content.use as Array<Record<string, unknown>>).find(
      (entry) => entry.plugin === 'shadowob',
    )?.options ?? {}) as Record<string, unknown>
    const server = ((shadowob.servers as Array<Record<string, unknown>>)[0] ?? {}) as Record<
      string,
      unknown
    >
    const channels = server.channels as Array<Record<string, unknown>>
    const buddies = shadowob.buddies as Array<Record<string, unknown>>
    const bindings = shadowob.bindings as Array<Record<string, unknown>>
    const spaceApp = (shadowob.spaceApps as Array<Record<string, unknown>>)[0] as Record<
      string,
      unknown
    >
    const grants = spaceApp.grants as Array<Record<string, unknown>>
    const agents = (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >

    expect(server).toMatchObject({
      id: 'video-workshop',
      slug: 'video-workshop',
    })
    expect(channels.map((channel) => channel.id)).toEqual(['briefs', 'production', 'qa'])
    expect(buddies.map((buddy) => buddy.name)).toEqual([
      'Coordinator Buddy',
      'BrandScout',
      'ReviewMiner',
      'ScriptSmith',
      'VideoForge',
      'FrameQA',
    ])
    expect(bindings).toHaveLength(6)
    expect(agents.map((agent) => agent.id)).toEqual([
      'video-workshop-coordinator',
      'brandscout',
      'reviewminer',
      'scriptsmith',
      'videoforge',
      'frameqa',
    ])
    expect((content.deployments as Record<string, unknown>).placement).toMatchObject({
      groups: [
        {
          id: 'video-workshop-openclaw',
          agentIds: [
            'video-workshop-coordinator',
            'brandscout',
            'reviewminer',
            'scriptsmith',
            'frameqa',
          ],
          isolation: 'shared-runner',
        },
      ],
    })
    const topology = planRuntimeTopology(content as CloudConfig)
    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'video-workshop-openclaw',
        runtime: 'openclaw',
        runtimeKind: 'openclaw',
        packageMode: 'multi-agent',
        shared: true,
        agentIds: [
          'video-workshop-coordinator',
          'brandscout',
          'reviewminer',
          'scriptsmith',
          'frameqa',
        ],
      }),
      expect.objectContaining({
        id: 'videoforge',
        runtime: 'hermes',
        runtimeKind: 'hermes',
        packageMode: 'single-agent',
        shared: false,
        agentIds: ['videoforge'],
      }),
    ])
    expect(topology.agentToExecutionUnit).toMatchObject({
      'video-workshop-coordinator': 'video-workshop-openclaw',
      brandscout: 'video-workshop-openclaw',
      reviewminer: 'video-workshop-openclaw',
      scriptsmith: 'video-workshop-openclaw',
      frameqa: 'video-workshop-openclaw',
      videoforge: 'videoforge',
    })
    expect(spaceApp).toMatchObject({
      id: 'kanban-space-app',
      serverId: 'video-workshop',
      catalogSpaceAppKey: 'kanban',
    })
    expect(grants.map((grant) => grant.buddyId)).toEqual([
      'coordinator-buddy',
      'brandscout-buddy',
      'reviewminer-buddy',
      'scriptsmith-buddy',
      'videoforge-buddy',
      'frameqa-buddy',
    ])
    expect(grants.find((grant) => grant.buddyId === 'coordinator-buddy')).toMatchObject({
      permissions: expect.arrayContaining([
        'kanban.boards:read',
        'kanban.cards:write',
        'buddy_inbox:deliver',
      ]),
      approvalMode: 'none',
    })
    expect(
      grants.every((grant) => (grant.permissions as string[]).includes('buddy_inbox:deliver')),
    ).toBe(true)
    expect(
      agents.every((agent) =>
        (agent.use as Array<Record<string, unknown>>).some((entry) => entry.plugin === 'skills'),
      ),
    ).toBe(true)
    const videoForgeSkills = (
      (
        agents.find((agent) => agent.id === 'videoforge')?.use as Array<Record<string, unknown>>
      ).find((entry) => entry.plugin === 'skills')?.options as Record<string, unknown>
    ).install as Array<Record<string, unknown>>
    expect(videoForgeSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: 'heygen-com/hyperframes',
          skills: expect.arrayContaining(['hyperframes', 'hyperframes-cli']),
        }),
        expect.objectContaining({
          package: 'remotion-dev/skills',
          skills: ['remotion'],
        }),
      ]),
    )
    expect(
      agents.find((agent) => agent.id === 'video-workshop-coordinator')?.identity,
    ).toMatchObject({
      systemPrompt: expect.stringContaining('cards.complete'),
    })
    expect(agents.find((agent) => agent.id === 'videoforge')?.identity).toMatchObject({
      systemPrompt: expect.stringContaining('shadow-video-render'),
    })
    expect(agents.find((agent) => agent.id === 'frameqa')?.identity).toMatchObject({
      systemPrompt: expect.stringContaining('Review the actual Workspace artifacts'),
    })
  })
})
