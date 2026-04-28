/**
 * agent-pack plugin — unit tests for the multi-kind, registry-free pack puller.
 */

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import agentPackPlugin, {
  buildAgentPackPrompt,
  resolvePacks,
} from '../../src/plugins/agent-pack/index.js'
import {
  buildAgentPackInitContainer,
  buildAgentPackInitScript,
  buildAgentPackSyncScript,
  parsePollInterval,
  type ResolvedPack,
  sanitizeId,
} from '../../src/plugins/agent-pack/k8s.js'

describe('agent-pack resolvePacks', () => {
  it('resolves a single pack with explicit url + mounts', () => {
    const r = resolvePacks({
      packs: [
        {
          url: 'https://github.com/coreyhaines31/marketingskills',
          mounts: [{ kind: 'skills', from: 'skills' }],
        },
      ],
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.id).toBe('coreyhaines31-marketingskills')
    expect(r[0]!.url).toContain('marketingskills')
    expect(r[0]!.ref).toBe('main')
    expect(r[0]!.mounts).toEqual([{ kind: 'skills', from: 'skills', include: undefined }])
  })

  it('honors explicit id override', () => {
    const r = resolvePacks({
      packs: [
        {
          id: 'mkt',
          url: 'https://github.com/coreyhaines31/marketingskills',
          mounts: [{ kind: 'skills', from: 'skills' }],
        },
      ],
    })
    expect(r[0]!.id).toBe('mkt')
  })

  it('strips .git suffix from auto-derived id', () => {
    const r = resolvePacks({
      packs: [
        {
          url: 'https://github.com/acme/skills.git',
          ref: 'v2',
          mounts: [{ kind: 'skills', from: 'pkg/skills' }],
        },
      ],
    })
    expect(r[0]!.id).toBe('acme-skills')
    expect(r[0]!.ref).toBe('v2')
    expect(r[0]!.mounts[0]!.from).toBe('pkg/skills')
  })

  it('supports multi-kind mounts in one pack', () => {
    const r = resolvePacks({
      packs: [
        {
          id: 'gstack',
          url: 'https://github.com/garrytan/gstack',
          mounts: [
            { kind: 'skills', from: '.' },
            { kind: 'instructions', from: '.' },
            { kind: 'scripts', from: 'bin' },
          ],
        },
      ],
    })
    expect(r[0]!.mounts.map((m) => m.kind)).toEqual(['skills', 'instructions', 'scripts'])
  })

  it('drops packs with no url', () => {
    const r = resolvePacks({
      packs: [{ id: 'broken', mounts: [{ kind: 'skills', from: '.' }] }],
    })
    expect(r).toHaveLength(0)
  })

  it('auto-detects common layouts when mounts are omitted', () => {
    const r = resolvePacks({ packs: [{ url: 'https://github.com/a/b' }] })
    expect(r).toHaveLength(1)
    expect(r[0]!.autoDetect).toBe(true)
    expect(r[0]!.mounts).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: 'skills' },
        { kind: 'skills', from: '.agents/skills' },
        { kind: 'skills', from: '.cursor/skills' },
        { kind: 'skills', from: '.gemini/skills' },
        { kind: 'skills', from: 'openclaw/skills' },
        { kind: 'skills', from: 'scientific-skills' },
        { kind: 'skills', from: 'plugins' },
        { kind: 'commands', from: '.claude/commands' },
        { kind: 'agents', from: '.claude/agents' },
        { kind: 'instructions', from: '.cursor/rules' },
        { kind: 'instructions', from: '.cursorrules' },
        { kind: 'instructions', from: 'context' },
        { kind: 'mcp', from: '.mcp.json' },
        { kind: 'scripts', from: 'bin' },
      ]),
    )
  })

  it('auto-detects broader upstream agent-pack conventions', () => {
    const r = resolvePacks({
      packs: [{ url: 'https://github.com/affaan-m/everything-claude-code' }],
    })
    const mounts = r[0]!.mounts

    expect(mounts).toEqual(
      expect.arrayContaining([
        { kind: 'skills', from: '.codex/skills' },
        { kind: 'skills', from: '.claude/plugins' },
        { kind: 'skills', from: 'agent-skills' },
        { kind: 'commands', from: 'slash-commands' },
        { kind: 'commands', from: '.cursor/commands' },
        { kind: 'agents', from: '.claude/subagents' },
        { kind: 'agents', from: 'subagents' },
        { kind: 'instructions', from: '.github/copilot-instructions.md' },
        { kind: 'instructions', from: 'memory-bank' },
        { kind: 'hooks', from: '.claude/settings.json' },
        { kind: 'mcp', from: '.cursor/mcp.json' },
        { kind: 'files', from: 'notebooks' },
      ]),
    )
  })

  it('drops packs with no mounts when autoDetect is disabled', () => {
    const r = resolvePacks({ packs: [{ url: 'https://github.com/a/b', autoDetect: false }] })
    expect(r).toHaveLength(0)
  })

  it('deduplicates packs sharing the same id', () => {
    const r = resolvePacks({
      packs: [
        { id: 'x', url: 'https://github.com/a/b', mounts: [{ kind: 'skills', from: '.' }] },
        { id: 'x', url: 'https://github.com/c/d', mounts: [{ kind: 'skills', from: '.' }] },
      ],
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.url).toContain('a/b')
  })

  it('builds runtime guidance for mounted packs', () => {
    const prompt = buildAgentPackPrompt(
      [
        {
          id: 'gstack',
          url: 'https://github.com/garrytan/gstack',
          ref: 'main',
          depth: 1,
          mounts: [
            { kind: 'skills', from: 'openclaw/skills' },
            { kind: 'instructions', from: 'openclaw' },
          ],
          instructionFiles: [],
        },
      ],
      '/agent-packs',
    )

    expect(prompt).toContain('Mounted Agent Packs')
    expect(prompt).toContain('/agent-packs/gstack/skills')
    expect(prompt).toContain('/agent-packs/gstack/instructions')
    expect(prompt).toContain('PACK_INSTRUCTIONS.md')
    expect(prompt).toContain('source-of-truth context')
  })

  it('summarizes auto-detected packs compactly in prompts', () => {
    const prompt = buildAgentPackPrompt(
      [
        {
          id: 'seomachine',
          url: 'https://github.com/TheCraigHewitt/seomachine',
          ref: 'main',
          depth: 1,
          autoDetect: true,
          mounts: [
            { kind: 'commands', from: '.claude/commands' },
            { kind: 'agents', from: '.claude/agents' },
            { kind: 'instructions', from: 'context' },
          ],
          instructionFiles: [],
        },
      ],
      '/agent-packs',
    )

    expect(prompt).toContain('auto-detected common layouts')
    expect(prompt).toContain('/agent-packs/seomachine/{skills,commands,agents')
  })
})

describe('agent-pack k8s helpers', () => {
  it('parsePollInterval understands s/m/h units', () => {
    expect(parsePollInterval('30s')).toBe(30)
    expect(parsePollInterval('5m')).toBe(300)
    expect(parsePollInterval('1h')).toBe(3600)
    expect(parsePollInterval(undefined)).toBe(0)
    expect(parsePollInterval('garbage')).toBe(0)
  })

  it('sanitizeId strips unsafe chars', () => {
    expect(sanitizeId('owner/repo.git')).toBe('owner_repo.git')
  })

  it('buildAgentPackInitContainer clones every pack and copies per-kind subdirs', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'marketingskills',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        mounts: [{ kind: 'skills', from: 'skills' }],
        instructionFiles: ['CLAUDE.md'],
      },
      {
        id: 'gstack',
        url: 'https://github.com/a/b',
        ref: 'main',
        depth: 1,
        mounts: [
          { kind: 'skills', from: '.' },
          { kind: 'instructions', from: '.' },
        ],
        instructionFiles: ['CLAUDE.md', 'AGENTS.md'],
      },
    ]
    const init = buildAgentPackInitContainer(
      packs,
      '/agent-packs',
      'agent-packs',
      'agent-pack-scripts',
    )
    expect(init.image).toBe('node:22-bookworm')
    expect(init.command[0]).toBe('/bin/sh')
    expect(init.command[1]).toBe('/opt/shadow-agent-pack/init.sh')
    expect(init.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      capabilities: { drop: ['ALL'] },
    })
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).toContain('command -v git')
    expect(script).not.toContain('apk add')
    expect(script).toContain('https://github.com/x/y')
    expect(script).toContain('https://github.com/a/b')
    expect(script).toContain('/agent-packs/marketingskills/skills')
    expect(script).toContain('/agent-packs/gstack/skills')
    expect(script).toContain('/agent-packs/gstack/instructions')
    expect(script).toContain('AGENTS.md')
    expect(script).toContain('.pack.json')
    expect(init.volumeMounts[0]!.mountPath).toBe('/agent-packs')
  })

  it('normalizes top-level command and agent markdown files into discoverable directories', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'seomachine',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        mounts: [
          { kind: 'commands', from: '.claude/commands' },
          { kind: 'agents', from: '.claude/agents' },
        ],
        instructionFiles: [],
      },
    ]
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).not.toContain('; ;')
    expect(script).toContain('basename "$f" .md')
    expect(script).toContain('/agent-packs/seomachine/commands/$slug/SKILL.md')
    expect(script).toContain('/agent-packs/seomachine/agents/$slug/AGENT.md')
    expect(script).toContain('/agent-packs/seomachine/agents/$slug/SKILL.md')
  })

  it('generates shell scripts that pass sh syntax validation', () => {
    const packs = resolvePacks({
      packs: [{ id: 'gstack', url: 'https://github.com/garrytan/gstack' }],
    })
    const initScript = buildAgentPackInitScript(packs, '/agent-packs', {
      enabled: true,
      outputPath: '/agent-packs/.shadow/slash-commands.json',
      inferInteractions: true,
      rules: [],
    })
    const syncScript = buildAgentPackSyncScript({
      packs,
      mountPath: '/agent-packs',
      intervalSec: 3600,
      slashCommandIndex: {
        enabled: true,
        outputPath: '/agent-packs/.shadow/slash-commands.json',
        inferInteractions: true,
        rules: [],
      },
    })

    for (const script of [initScript, syncScript]) {
      const result = spawnSync('/bin/sh', ['-n'], { input: script, encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    }
  })

  it('copies root SKILL.md files for single-skill repositories', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'gstack',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        autoDetect: true,
        mounts: [{ kind: 'skills', from: '.' }],
        instructionFiles: [],
      },
    ]
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).toContain('if [ -f "/tmp/agent-pack-src-gstack/SKILL.md" ]')
    expect(script).toContain('/agent-packs/gstack/skills/gstack/SKILL.md')
  })

  it('normalizes top-level *-SKILL.md files into skill directories', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'seomachine',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        autoDetect: true,
        mounts: [{ kind: 'skills', from: '.claude/skills' }],
        instructionFiles: [],
      },
    ]
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).toContain("-name '*-SKILL.md'")
    expect(script).toContain("sed 's/-SKILL$//'")
    expect(script).toContain('/agent-packs/seomachine/skills/$slug/SKILL.md')
  })

  it('recursively discovers nested skill folders inside plugin collections', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'wshobson-agents',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        autoDetect: true,
        mounts: [{ kind: 'skills', from: 'plugins' }],
        instructionFiles: [],
      },
    ]
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).toContain("-maxdepth 6 -type f -name 'SKILL.md'")
    expect(script).toContain('cp -r "$d/." "/agent-packs/wshobson-agents/skills/$slug/"')
  })

  it('copies Cursor-style rule files as instructions', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'cursor-rules',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        autoDetect: true,
        mounts: [
          { kind: 'instructions', from: '.cursorrules' },
          { kind: 'instructions', from: '.cursor/rules' },
        ],
        instructionFiles: [],
      },
    ]
    const script = buildAgentPackInitScript(packs, '/agent-packs')
    expect(script).toContain('if [ -f "/tmp/agent-pack-src-cursor-rules/.cursorrules" ]')
    expect(script).toContain("-name '*.mdc'")
  })

  it('can append a plugin-owned slash command indexer to the init container', () => {
    const packs: ResolvedPack[] = [
      {
        id: 'gstack',
        url: 'https://github.com/x/y',
        ref: 'main',
        depth: 1,
        mounts: [{ kind: 'skills', from: 'openclaw/skills' }],
        instructionFiles: [],
      },
    ]
    const slashCommandIndex = {
      enabled: true,
      outputPath: '/agent-packs/.shadow/slash-commands.json',
      inferInteractions: true,
      rules: [],
    }
    const init = buildAgentPackInitContainer(
      packs,
      '/agent-packs',
      'agent-packs',
      'agent-pack-scripts',
      slashCommandIndex,
    )
    expect(init.command[1]).toBe('/opt/shadow-agent-pack/init.sh')
    const script = buildAgentPackInitScript(packs, '/agent-packs', slashCommandIndex)
    expect(script).toContain('/tmp/agent-pack-slash-indexer.mjs')
    expect(script).toContain("--mount-path '/agent-packs'")
    expect(script).toContain("--output '/agent-packs/.shadow/slash-commands.json'")
    expect(script).toContain('Wrote ')
  })

  it('runs helper containers without package installs while keeping the pod non-root', () => {
    const result = agentPackPlugin.k8s?.buildK8s(
      {
        id: 'strategy-buddy',
        runtime: 'openclaw',
        use: [
          {
            plugin: 'agent-pack',
            options: {
              packs: [{ id: 'gstack', url: 'https://github.com/garrytan/gstack' }],
              poll: '1h',
            },
          },
        ],
      } as never,
      { agent: {} as never, config: {} as never, namespace: 'gstack-buddy' },
    )

    expect(result?.initContainers?.[0]?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      capabilities: { drop: ['ALL'] },
    })
    expect(result?.sidecars?.[0]?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      capabilities: { drop: ['ALL'] },
    })

    const skillsEnv = result?.envVars?.find((env) => env.name === 'SHADOW_PACK_SKILLS_DIRS')
    expect(skillsEnv?.value).toBe('/agent-packs/gstack/skills')
  })
})
