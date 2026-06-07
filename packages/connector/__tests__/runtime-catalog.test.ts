import { describe, expect, it } from 'vitest'
import { connectorRuntimeInstallCommands } from '../src/runtime-catalog'

describe('connector runtime catalog', () => {
  it('uses non-interactive Hermes install commands', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const command = connectorRuntimeInstallCommands('hermes', platform)[0]

      expect(command).toContain('--skip-setup')
      expect(command).toContain('--non-interactive')
      expect(command).toContain('--skip-browser')
    }
  })

  it('prepares xz before installing Hermes on Linux', () => {
    const command = connectorRuntimeInstallCommands('hermes', 'linux')[0]

    expect(command).toContain('command -v xz')
    expect(command).toContain('xz-utils')
    expect(command).toContain('apk add --no-cache xz')
  })

  it('installs Antigravity CLI without opening a browser page', () => {
    expect(connectorRuntimeInstallCommands('antigravity', 'linux')[0]).toBe(
      'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    )
    expect(connectorRuntimeInstallCommands('antigravity', 'darwin')[0]).toBe(
      'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    )
    expect(connectorRuntimeInstallCommands('antigravity', 'win32')[0]).toContain(
      'https://antigravity.google/cli/install.ps1',
    )
  })

  it('does not offer the WSL-only Cursor installer on native Windows', () => {
    expect(connectorRuntimeInstallCommands('cursor', 'win32')).toEqual([])
  })

  it('does not offer the WSL-only Hermes installer on native Windows', () => {
    expect(connectorRuntimeInstallCommands('hermes', 'win32')).toEqual([])
  })

  it('uses official Windows install commands for Claude Code and GitHub Copilot', () => {
    expect(connectorRuntimeInstallCommands('claude-code', 'win32')[0]).toContain(
      'https://claude.ai/install.ps1',
    )
    expect(connectorRuntimeInstallCommands('copilot', 'win32')).toEqual([
      'winget install --id GitHub.Copilot --exact',
      'npm install -g @github/copilot',
    ])
  })
})
