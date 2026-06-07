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

  it('installs Cursor CLI through WSL on Windows', () => {
    expect(connectorRuntimeInstallCommands('cursor', 'win32')[0]).toContain('wsl.exe bash -lc')
    expect(connectorRuntimeInstallCommands('cursor', 'win32')[0]).toContain('cursor.com/install')
  })

  it('uses the native Hermes Windows installer', () => {
    expect(connectorRuntimeInstallCommands('hermes', 'win32')[0]).toContain(
      'https://hermes-agent.nousresearch.com/install.ps1',
    )
  })

  it('uses official Windows install commands for Claude Code and GitHub Copilot', () => {
    expect(connectorRuntimeInstallCommands('claude-code', 'win32')[0]).toContain(
      'https://claude.ai/install.ps1',
    )
    expect(connectorRuntimeInstallCommands('copilot', 'win32')).toEqual([
      'winget install GitHub.Copilot',
      'npm install -g @github/copilot',
    ])
  })

  it('keeps platform install commands aligned with official docs', () => {
    expect(connectorRuntimeInstallCommands('openclaw', 'darwin')[0]).toContain(
      'https://openclaw.ai/install.sh',
    )
    expect(connectorRuntimeInstallCommands('openclaw', 'linux')[0]).toContain(
      'https://openclaw.ai/install.sh',
    )
    expect(connectorRuntimeInstallCommands('openclaw', 'win32')[0]).toContain(
      'https://openclaw.ai/install.ps1',
    )

    expect(connectorRuntimeInstallCommands('claude-code', 'darwin')[0]).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash',
    )
    expect(connectorRuntimeInstallCommands('claude-code', 'linux')[0]).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash',
    )

    expect(connectorRuntimeInstallCommands('codex', 'darwin')[0]).toBe(
      'npm install -g @openai/codex',
    )
    expect(connectorRuntimeInstallCommands('codex', 'linux')[0]).toBe(
      'npm install -g @openai/codex',
    )
    expect(connectorRuntimeInstallCommands('codex', 'win32')[0]).toBe(
      'npm install -g @openai/codex',
    )

    expect(connectorRuntimeInstallCommands('opencode', 'darwin')[0]).toBe(
      'curl -fsSL https://opencode.ai/install | bash',
    )
    expect(connectorRuntimeInstallCommands('opencode', 'linux')[0]).toBe(
      'curl -fsSL https://opencode.ai/install | bash',
    )
    expect(connectorRuntimeInstallCommands('opencode', 'win32')[0]).toBe(
      'npm install -g opencode-ai',
    )

    expect(connectorRuntimeInstallCommands('kimi', 'darwin')[0]).toBe(
      'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash',
    )
    expect(connectorRuntimeInstallCommands('kimi', 'linux')[0]).toBe(
      'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash',
    )
    expect(connectorRuntimeInstallCommands('kimi', 'win32')[0]).toContain(
      'https://code.kimi.com/kimi-code/install.ps1',
    )
  })
})
