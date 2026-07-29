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
