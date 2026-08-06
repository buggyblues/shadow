import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import { createProgram, isMainModule } from '../src/index'

describe('CLI program metadata and options', () => {
  it('uses the package version and leaves profile selection to subcommands', () => {
    const program = createProgram()

    expect(program.version()).toBe(packageJson.version)
    expect(program.options.some((option) => option.long === '--profile')).toBe(false)

    const auth = program.commands.find((command) => command.name() === 'auth')
    const login = auth?.commands.find((command) => command.name() === 'login')
    expect(login?.options.some((option) => option.long === '--profile')).toBe(true)

    const localBridge = program.commands.find((command) => command.name() === 'local-bridge')
    expect(localBridge?.commands.map((command) => command.name())).toEqual([
      'start',
      'status',
      'stop',
      'logs',
      'library',
      'plugins',
      'resources',
      'custom-plugins',
      'plugin-settings',
      'plugin-agents',
      'pets',
      'themes',
      'wallpapers',
      'skills',
      'tasks',
      'runtimes',
      'mcp-servers',
      'inspect',
      'doctor',
      'guide',
      'mcp',
    ])
    const plugins = localBridge?.commands.find((command) => command.name() === 'plugins')
    expect(plugins?.commands.map((command) => command.name())).toEqual(['list', 'run', 'invoke'])
    const tasks = localBridge?.commands.find((command) => command.name() === 'tasks')
    expect(tasks?.commands.map((command) => command.name())).toEqual([
      'list',
      'get',
      'wait',
      'cancel',
    ])
    const library = localBridge?.commands.find((command) => command.name() === 'library')
    expect(library?.commands.map((command) => command.name())).toEqual([
      'overview',
      'files',
      'read',
      'search',
    ])
    const runtimes = localBridge?.commands.find((command) => command.name() === 'runtimes')
    expect(runtimes?.commands.map((command) => command.name())).toEqual(['list', 'run'])
    const mcpServers = localBridge?.commands.find((command) => command.name() === 'mcp-servers')
    expect(mcpServers?.commands.map((command) => command.name())).toEqual(['list', 'request'])
    const customPlugins = localBridge?.commands.find(
      (command) => command.name() === 'custom-plugins',
    )
    expect(customPlugins?.commands.map((command) => command.name())).toEqual([
      'list',
      'get',
      'validate',
      'publish',
      'remove',
    ])
    const skills = localBridge?.commands.find((command) => command.name() === 'skills')
    expect(skills?.commands.map((command) => command.name())).toEqual([
      'list',
      'get',
      'install',
      'enable',
      'disable',
      'remove',
    ])
  })

  it('recognizes the executable entry through a symlink', () => {
    const directory = mkdtempSync(join(tmpdir(), 'shadow-cli-main-'))
    const entryPath = join(directory, 'shadowob')
    symlinkSync(fileURLToPath(import.meta.url), entryPath)

    try {
      expect(isMainModule(import.meta.url, entryPath)).toBe(true)
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})
