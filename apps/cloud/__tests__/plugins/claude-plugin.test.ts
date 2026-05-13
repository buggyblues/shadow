/**
 * claude-plugin tests — Claude marketplace and plugin import wiring.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLAUDE_PLUGIN_IMPORTER_SCRIPT } from '../../src/plugins/claude-plugin/importer-script.js'
import claudePlugin, {
  buildClaudePluginPrompt,
  resolveClaudePluginSources,
} from '../../src/plugins/claude-plugin/index.js'
import {
  buildClaudePluginInitScript,
  buildClaudePluginSyncScript,
  claudePluginSlashCommandsIndexPath,
  parsePollInterval,
} from '../../src/plugins/claude-plugin/k8s.js'

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  expect(result.stderr).not.toContain('fatal:')
  expect(result.status).toBe(0)
}

function writeFile(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf-8')
}

describe('claude-plugin source resolution', () => {
  it('normalizes GitHub tree URLs into git source plans', () => {
    const sources = resolveClaudePluginSources({
      plugins: [
        {
          url: 'https://github.com/anthropics/financial-services/tree/main/plugins/agent-plugins',
          plugins: ['pitch-agent'],
        },
      ],
    })

    expect(sources).toEqual([
      {
        id: 'anthropics-financial-services-plugins-agent-plugins',
        kind: 'plugins',
        url: 'https://github.com/anthropics/financial-services.git',
        ref: 'main',
        depth: 1,
        path: 'plugins/agent-plugins',
        include: ['pitch-agent'],
      },
    ])
  })

  it('builds prompt guidance for marketplace imports', () => {
    const sources = resolveClaudePluginSources({
      marketplaces: [{ repo: 'anthropics/financial-services', plugins: ['pitch-agent'] }],
    })
    const prompt = buildClaudePluginPrompt(sources, '/claude-plugins')

    expect(prompt).toContain('Imported Claude Plugins')
    expect(prompt).toContain('/claude-plugins/.shadow/skills')
    expect(prompt).toContain('pitch-agent')
  })
})

describe('claude-plugin k8s helpers', () => {
  it('parsePollInterval understands s/m/h units', () => {
    expect(parsePollInterval('30s')).toBe(30)
    expect(parsePollInterval('5m')).toBe(300)
    expect(parsePollInterval('1h')).toBe(3600)
    expect(parsePollInterval(undefined)).toBe(0)
  })

  it('generates shell scripts that pass sh syntax validation', () => {
    const sources = resolveClaudePluginSources({
      marketplaces: [{ repo: 'anthropics/financial-services', plugins: ['pitch-agent'] }],
    })
    const initScript = buildClaudePluginInitScript(sources, '/claude-plugins', {
      enabled: true,
      outputPath: claudePluginSlashCommandsIndexPath('/claude-plugins'),
      inferInteractions: true,
      rules: [],
    })
    const syncScript = buildClaudePluginSyncScript({
      sources,
      mountPath: '/claude-plugins',
      intervalSec: 3600,
      slashCommandIndex: {
        enabled: true,
        outputPath: claudePluginSlashCommandsIndexPath('/claude-plugins'),
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

  it('builds pod artifacts for enabled agents', () => {
    const result = claudePlugin.k8s?.buildK8s(
      {
        id: 'finance-buddy',
        runtime: 'openclaw',
        use: [
          {
            plugin: 'claude-plugin',
            options: {
              marketplaces: [{ repo: 'anthropics/financial-services', plugins: ['pitch-agent'] }],
              poll: '1h',
            },
          },
        ],
      } as never,
      { agent: {} as never, config: {} as never, namespace: 'finance-buddy' },
    )

    expect(result?.initContainers?.[0]?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      capabilities: { drop: ['ALL'] },
    })
    expect(result?.sidecars?.[0]?.name).toBe('claude-plugin-sync')
    expect(result?.volumeMounts?.[0]?.mountPath).toBe('/claude-plugins')
    expect(
      result?.envVars?.find((env) => env.name === 'SHADOW_CLAUDE_PLUGIN_SKILLS_DIR')?.value,
    ).toBe('/claude-plugins/.shadow/skills')
    expect(result?.configMaps?.[0]?.data['init.sh']).toContain('claude-plugin-importer.mjs')
  })

  it('combines repeated agent-scoped declarations into one init flow', () => {
    const result = claudePlugin.k8s?.buildK8s(
      {
        id: 'finance-buddy',
        runtime: 'openclaw',
        use: [
          {
            plugin: 'claude-plugin',
            options: {
              marketplaces: [{ repo: 'anthropics/financial-services', plugins: ['pitch-agent'] }],
            },
          },
          {
            plugin: 'claude-plugin',
            options: {
              marketplaces: [
                { repo: 'anthropics/financial-services', plugins: ['market-researcher'] },
              ],
            },
          },
        ],
      } as never,
      { agent: {} as never, config: {} as never, namespace: 'finance-buddy' },
    )

    expect(result?.initContainers).toHaveLength(1)
    expect(result?.configMaps).toHaveLength(1)
    const initScript = result?.configMaps?.[0]?.data['init.sh'] ?? ''
    expect(initScript).toContain('"pitch-agent"')
    expect(initScript).toContain('"market-researcher"')
  })
})

describe('claude-plugin runtime importer', () => {
  it('imports a local Claude marketplace into normalized Shadow directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'shadow-claude-plugin-test-'))
    const repo = join(root, 'repo')
    const mountPath = join(root, 'mount')
    mkdirSync(repo, { recursive: true })

    writeFile(
      join(repo, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({
        name: 'test-marketplace',
        plugins: [
          {
            name: 'pitch-agent',
            source: './plugins/pitch-agent',
            description: 'Pitch workflow',
          },
        ],
      }),
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'pitch-agent',
        version: '0.1.0',
        description: 'Pitch workflow',
      }),
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', 'skills', 'comps-analysis', 'SKILL.md'),
      '# Comps analysis\n',
    )
    writeFile(join(repo, 'plugins', 'pitch-agent', 'commands', 'comps.md'), '# Comps\n')
    writeFile(
      join(repo, 'plugins', 'pitch-agent', 'agents', 'pitch-agent.md'),
      '---\nname: pitch-agent\ndescription: Pitch agent\n---\n\nRun the workflow.\n',
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', '.mcp.json'),
      JSON.stringify({ mcpServers: { capiq: { command: 'npx', args: ['capiq'] } } }),
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', '.lsp.json'),
      JSON.stringify({ ts: { command: 'typescript-language-server', args: ['--stdio'] } }),
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', 'monitors', 'monitors.json'),
      JSON.stringify([{ name: 'ticker', command: 'echo ok', description: 'Ticker monitor' }]),
    )
    writeFile(join(repo, 'plugins', 'pitch-agent', 'output-styles', 'terse.md'), '# Terse\n')
    writeFile(join(repo, 'plugins', 'pitch-agent', 'themes', 'banker.json'), '{"name":"banker"}\n')
    writeFile(join(repo, 'plugins', 'pitch-agent', 'bin', 'pitch-tool'), '#!/bin/sh\necho pitch\n')
    writeFile(
      join(repo, 'plugins', 'pitch-agent', 'scripts', 'format.sh'),
      '#!/bin/sh\necho format\n',
    )
    writeFile(
      join(repo, 'plugins', 'pitch-agent', 'settings.json'),
      JSON.stringify({ agent: 'pitch-agent' }),
    )

    runGit(repo, ['init'])
    runGit(repo, ['config', 'user.email', 'test@example.com'])
    runGit(repo, ['config', 'user.name', 'Test User'])
    runGit(repo, ['add', '.'])
    runGit(repo, ['commit', '-m', 'fixture'])

    const importerPath = join(root, 'importer.mjs')
    const planPath = join(root, 'plan.json')
    writeFileSync(importerPath, CLAUDE_PLUGIN_IMPORTER_SCRIPT, 'utf-8')
    writeFileSync(
      planPath,
      JSON.stringify({
        mountPath,
        sources: [
          {
            id: 'finance',
            kind: 'marketplace',
            url: repo,
            depth: 1,
            include: ['pitch-agent'],
          },
        ],
      }),
      'utf-8',
    )

    const result = spawnSync(process.execPath, [importerPath, planPath], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)

    expect(existsSync(join(mountPath, 'pitch-agent', 'skills', 'comps-analysis', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(mountPath, 'pitch-agent', 'commands', 'comps', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'agents', 'pitch-agent', 'AGENT.md'))).toBe(
      true,
    )
    expect(existsSync(join(mountPath, 'pitch-agent', 'mcp', '.mcp.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'lsp', '.lsp.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'monitors', 'monitors.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'output-styles', 'terse.md'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'themes', 'banker.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'bin', 'pitch-tool'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'scripts', 'format.sh'))).toBe(true)
    expect(existsSync(join(mountPath, 'pitch-agent', 'settings', 'settings.json'))).toBe(true)
    expect(existsSync(join(mountPath, '.shadow', 'bin', 'pitch-tool'))).toBe(true)
    expect(existsSync(join(mountPath, '.shadow', 'bin', 'pitch-agent-pitch-tool'))).toBe(true)
    expect(
      existsSync(join(mountPath, '.shadow', 'skills', 'pitch-agent-comps-analysis', 'SKILL.md')),
    ).toBe(true)

    const imported = JSON.parse(readFileSync(join(mountPath, '.shadow', 'plugins.json'), 'utf-8'))
    expect(imported[0].id).toBe('pitch-agent')
    expect(imported[0].counts).toMatchObject({
      lsp: 1,
      monitors: 1,
      outputStyles: 1,
      themes: 1,
      bin: 1,
      scripts: 1,
      settings: 1,
      metadata: 2,
    })
  })

  it('honors Claude component path behavior and preserves manifest metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'shadow-claude-plugin-paths-'))
    const repo = join(root, 'repo')
    const mountPath = join(root, 'mount')
    mkdirSync(repo, { recursive: true })

    writeFile(
      join(repo, 'plugins', 'pathy', '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'pathy',
        description: 'Path behavior plugin',
        skills: ['./extra-skills'],
        commands: ['./custom-commands/deploy.md'],
        agents: ['./custom-agents/reviewer.md'],
        hooks: ['./hooks-extra.json'],
        mcpServers: { capiq: { command: 'npx', args: ['capiq'] } },
        lspServers: { go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } },
        outputStyles: ['./styles'],
        themes: ['./theme-config'],
        monitors: ['./monitor-config/monitors.json'],
        userConfig: {
          api_token: {
            type: 'string',
            title: 'API token',
            description: 'API authentication token',
            sensitive: true,
          },
        },
        channels: [{ server: 'capiq' }],
        dependencies: ['shared-secrets'],
      }),
    )
    writeFile(
      join(repo, 'plugins', 'pathy', 'skills', 'folder-name', 'SKILL.md'),
      '---\nname: stable-name\ndescription: Stable name\n---\n\nUse the stable name.\n',
    )
    writeFile(
      join(repo, 'plugins', 'pathy', 'extra-skills', 'extra', 'SKILL.md'),
      '---\nname: extra-skill\ndescription: Extra skill\n---\n\nUse the extra skill.\n',
    )
    writeFile(join(repo, 'plugins', 'pathy', 'commands', 'ignored.md'), '# Ignored default\n')
    writeFile(join(repo, 'plugins', 'pathy', 'custom-commands', 'deploy.md'), '# Deploy\n')
    writeFile(join(repo, 'plugins', 'pathy', 'agents', 'ignored.md'), '# Ignored agent\n')
    writeFile(join(repo, 'plugins', 'pathy', 'custom-agents', 'reviewer.md'), '# Reviewer\n')
    writeFile(
      join(repo, 'plugins', 'pathy', 'hooks', 'hooks.json'),
      '{"hooks":{"SessionStart":[]}}\n',
    )
    writeFile(join(repo, 'plugins', 'pathy', 'hooks-extra.json'), '{"hooks":{"PostToolUse":[]}}\n')
    writeFile(
      join(repo, 'plugins', 'pathy', '.mcp.json'),
      '{"mcpServers":{"default":{"command":"echo"}}}\n',
    )
    writeFile(
      join(repo, 'plugins', 'pathy', '.lsp.json'),
      '{"ts":{"command":"tsserver","extensionToLanguage":{".ts":"typescript"}}}\n',
    )
    writeFile(join(repo, 'plugins', 'pathy', 'output-styles', 'ignored.md'), '# Ignored style\n')
    writeFile(join(repo, 'plugins', 'pathy', 'styles', 'concise.md'), '# Concise\n')
    writeFile(join(repo, 'plugins', 'pathy', 'themes', 'ignored.json'), '{"name":"ignored"}\n')
    writeFile(join(repo, 'plugins', 'pathy', 'theme-config', 'dark.json'), '{"name":"dark"}\n')
    writeFile(
      join(repo, 'plugins', 'pathy', 'monitors', 'monitors.json'),
      '[{"name":"ignored","command":"echo ignored","description":"Ignored"}]\n',
    )
    writeFile(
      join(repo, 'plugins', 'pathy', 'monitor-config', 'monitors.json'),
      '[{"name":"custom","command":"echo custom","description":"Custom"}]\n',
    )

    runGit(repo, ['init'])
    runGit(repo, ['config', 'user.email', 'test@example.com'])
    runGit(repo, ['config', 'user.name', 'Test User'])
    runGit(repo, ['add', '.'])
    runGit(repo, ['commit', '-m', 'fixture'])

    const importerPath = join(root, 'importer.mjs')
    const planPath = join(root, 'plan.json')
    writeFileSync(importerPath, CLAUDE_PLUGIN_IMPORTER_SCRIPT, 'utf-8')
    writeFileSync(
      planPath,
      JSON.stringify({
        mountPath,
        sources: [
          {
            id: 'direct',
            kind: 'plugins',
            url: repo,
            depth: 1,
            path: 'plugins',
            include: ['pathy'],
          },
        ],
      }),
      'utf-8',
    )

    const result = spawnSync(process.execPath, [importerPath, planPath], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)

    expect(existsSync(join(mountPath, '.shadow', 'skills', 'pathy-stable-name', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(mountPath, '.shadow', 'skills', 'pathy-extra-skill', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(mountPath, 'pathy', 'commands', 'deploy', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'commands', 'ignored', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(mountPath, 'pathy', 'agents', 'reviewer', 'AGENT.md'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'agents', 'ignored', 'AGENT.md'))).toBe(false)
    expect(existsSync(join(mountPath, 'pathy', 'hooks', 'hooks.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'hooks', 'hooks-extra.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'mcp', '.mcp.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'mcp', 'mcp-inline.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'lsp', '.lsp.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'lsp', 'lsp-inline.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'output-styles', 'concise.md'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'output-styles', 'ignored.md'))).toBe(false)
    expect(existsSync(join(mountPath, 'pathy', 'themes', 'dark.json'))).toBe(true)
    expect(existsSync(join(mountPath, 'pathy', 'themes', 'ignored.json'))).toBe(false)
    expect(readFileSync(join(mountPath, 'pathy', 'monitors', 'monitors.json'), 'utf-8')).toContain(
      'custom',
    )

    const manifest = JSON.parse(
      readFileSync(join(mountPath, 'pathy', '.claude-plugin', 'plugin.json'), 'utf-8'),
    )
    expect(manifest.userConfig.api_token.sensitive).toBe(true)
    expect(manifest.channels[0].server).toBe('capiq')
    expect(manifest.dependencies).toContain('shared-secrets')
  })
})
