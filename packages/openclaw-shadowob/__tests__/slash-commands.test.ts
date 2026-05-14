import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadShadowSlashCommands,
  registerAgentSlashCommands,
} from '../src/monitor/slash-commands.js'

const originalShadowSlashCommandsPath = process.env.SHADOW_SLASH_COMMANDS_PATH
const originalDefaultSlashCommandsPath = process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH
const originalRuntimeExtensionsPath = process.env.SHADOW_RUNTIME_EXTENSIONS_PATH
const originalOpenClawRuntimeExtensionsPath = process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()

  if (originalShadowSlashCommandsPath === undefined) delete process.env.SHADOW_SLASH_COMMANDS_PATH
  else process.env.SHADOW_SLASH_COMMANDS_PATH = originalShadowSlashCommandsPath

  if (originalDefaultSlashCommandsPath === undefined) {
    delete process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH
  } else {
    process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH = originalDefaultSlashCommandsPath
  }

  if (originalRuntimeExtensionsPath === undefined) delete process.env.SHADOW_RUNTIME_EXTENSIONS_PATH
  else process.env.SHADOW_RUNTIME_EXTENSIONS_PATH = originalRuntimeExtensionsPath

  if (originalOpenClawRuntimeExtensionsPath === undefined) {
    delete process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH
  } else {
    process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH = originalOpenClawRuntimeExtensionsPath
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'shadow-slash-'))
  tempDirs.push(dir)
  return dir
}

describe('OpenClaw slash command discovery', () => {
  it('loads official runtime extension slash commands', async () => {
    const dir = await createTempDir()
    const commandsPath = join(dir, 'official-slash.json')
    const manifestPath = join(dir, 'runtime-extensions.json')
    await writeFile(
      commandsPath,
      JSON.stringify([
        {
          name: '/deploy',
          description: 'Deploy from official runtime',
          dispatch: 'passthrough',
        },
      ]),
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        artifacts: [{ kind: 'shadow.slashCommands', path: commandsPath }],
      }),
    )

    process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH = join(dir, 'missing-default-slash.json')
    delete process.env.SHADOW_SLASH_COMMANDS_PATH
    process.env.SHADOW_RUNTIME_EXTENSIONS_PATH = manifestPath
    delete process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH

    const commands = await loadShadowSlashCommands({ log: vi.fn(), error: vi.fn() })

    expect(commands).toEqual([
      {
        name: 'deploy',
        description: 'Deploy from official runtime',
        dispatch: 'passthrough',
      },
    ])
  })

  it('merges local and official commands with local definitions first', async () => {
    const dir = await createTempDir()
    const localCommandsPath = join(dir, 'local-slash.json')
    const officialCommandsPath = join(dir, 'official-slash.json')
    const manifestPath = join(dir, 'runtime-extensions.json')
    await writeFile(
      localCommandsPath,
      JSON.stringify([
        { name: 'deploy', description: 'Local override' },
        { name: 'local-only', description: 'Local only' },
      ]),
    )
    await writeFile(
      officialCommandsPath,
      JSON.stringify([
        { name: 'deploy', description: 'Official duplicate' },
        { name: 'official-only', description: 'Official only' },
      ]),
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        artifacts: [{ kind: 'shadow.slashCommands', path: officialCommandsPath }],
      }),
    )

    process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH = join(dir, 'missing-default-slash.json')
    process.env.SHADOW_SLASH_COMMANDS_PATH = localCommandsPath
    process.env.SHADOW_RUNTIME_EXTENSIONS_PATH = manifestPath
    delete process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH

    const commands = await loadShadowSlashCommands({ log: vi.fn(), error: vi.fn() })

    expect(commands.map((command) => [command.name, command.description])).toEqual([
      ['deploy', 'Local override'],
      ['local-only', 'Local only'],
      ['official-only', 'Official only'],
    ])
  })

  it('keeps runner commands ahead of plugin slash command artifacts', async () => {
    const dir = await createTempDir()
    const runnerCommandsPath = join(dir, 'runner-slash.json')
    const agentPackCommandsPath = join(dir, 'agent-pack-slash.json')
    const claudePluginCommandsPath = join(dir, 'claude-plugin-slash.json')
    const manifestPath = join(dir, 'runtime-extensions.json')
    await writeFile(
      runnerCommandsPath,
      JSON.stringify([
        { name: 'deploy', description: 'Runner deploy command' },
        { name: 'model', description: 'Runner model command' },
      ]),
    )
    await writeFile(
      agentPackCommandsPath,
      JSON.stringify([
        { name: 'deploy', description: 'Agent pack duplicate deploy' },
        { name: 'office-hours', description: 'Agent pack office hours' },
      ]),
    )
    await writeFile(
      claudePluginCommandsPath,
      JSON.stringify([
        { name: 'office-hours', description: 'Claude plugin duplicate office hours' },
        { name: 'brainstorm', description: 'Claude plugin brainstorm' },
      ]),
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        artifacts: [
          { kind: 'shadow.slashCommands', path: agentPackCommandsPath },
          { kind: 'shadow.slashCommands', path: claudePluginCommandsPath },
        ],
      }),
    )

    process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH = runnerCommandsPath
    delete process.env.SHADOW_SLASH_COMMANDS_PATH
    process.env.SHADOW_RUNTIME_EXTENSIONS_PATH = manifestPath
    delete process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH

    const log = vi.fn()
    const commands = await loadShadowSlashCommands({ log, error: vi.fn() })

    expect(commands.map((command) => [command.name, command.description])).toEqual([
      ['deploy', 'Runner deploy command'],
      ['model', 'Runner model command'],
      ['office-hours', 'Agent pack office hours'],
      ['brainstorm', 'Claude plugin brainstorm'],
    ])
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring duplicate command /deploy from'),
    )
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring duplicate command /office-hours from'),
    )
  })

  it('does not publish internal dispatch metadata to Shadow', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await registerAgentSlashCommands({
      account: { serverUrl: 'https://shadow.example.com', token: 'shadow-token' },
      agentId: 'agent-1',
      commands: [
        {
          name: 'model',
          description: 'OpenClaw native model command',
          dispatch: 'passthrough',
          body: 'internal prompt body',
        },
      ],
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as { body?: unknown } | undefined
    const body = JSON.parse(String(requestInit?.body))
    expect(body.commands).toEqual([
      {
        name: 'model',
        description: 'OpenClaw native model command',
      },
    ])

    vi.unstubAllGlobals()
  })
})
