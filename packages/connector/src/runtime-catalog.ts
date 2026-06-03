export type ConnectorRuntimeKind = 'openclaw' | 'cli'

export type ConnectorRuntimeId =
  | 'openclaw'
  | 'hermes'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'gemini'
  | 'cursor'
  | 'kimi'
  | 'copilot'
  | 'antigravity'

export type ConnectorRuntimePlatform = NodeJS.Platform | 'default'

export interface ConnectorRuntimeInstallSpec {
  commands?: Partial<Record<ConnectorRuntimePlatform, string[]>>
  helpUrl: string
}

export interface ConnectorRuntimeCatalogEntry {
  id: ConnectorRuntimeId
  label: string
  kind: ConnectorRuntimeKind
  command: string
  commands?: string[]
  versionArgs?: string[]
  iconId: string
  install: ConnectorRuntimeInstallSpec
}

const HERMES_INSTALL_SCRIPT =
  'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup --non-interactive --skip-browser'

const HERMES_LINUX_INSTALL_SCRIPT = [
  'sh -c \'set -e; if ! command -v xz >/dev/null 2>&1; then if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else echo "Hermes Agent installer requires xz; install xz-utils/xz and retry." >&2; exit 1; fi; if command -v apt-get >/dev/null 2>&1; then $SUDO apt-get update && $SUDO apt-get install -y xz-utils; elif command -v apk >/dev/null 2>&1; then $SUDO apk add --no-cache xz; elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y xz; elif command -v yum >/dev/null 2>&1; then $SUDO yum install -y xz; elif command -v pacman >/dev/null 2>&1; then $SUDO pacman -Sy --noconfirm xz; else echo "Hermes Agent installer requires xz; install xz-utils/xz and retry." >&2; exit 1; fi; fi; curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup --non-interactive --skip-browser\'',
]

export const CONNECTOR_RUNTIME_CATALOG: ConnectorRuntimeCatalogEntry[] = [
  {
    id: 'openclaw',
    label: 'OpenClaw',
    kind: 'openclaw',
    command: 'openclaw',
    iconId: 'openclaw',
    install: {
      commands: {
        darwin: ['curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'],
        linux: ['curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'],
        win32: [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard"',
        ],
        default: ['curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard'],
      },
      helpUrl: 'https://docs.openclaw.ai/install/index',
    },
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    kind: 'cli',
    command: 'hermes',
    iconId: 'hermes',
    install: {
      commands: {
        darwin: [HERMES_INSTALL_SCRIPT],
        linux: HERMES_LINUX_INSTALL_SCRIPT,
        win32: [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)"',
        ],
        default: ['pipx install hermes-agent'],
      },
      helpUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
    },
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'cli',
    command: 'claude',
    iconId: 'claude-code',
    install: {
      commands: {
        default: ['npm install -g @anthropic-ai/claude-code'],
      },
      helpUrl: 'https://code.claude.com/docs/en/installation',
    },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    kind: 'cli',
    command: 'codex',
    iconId: 'codex',
    install: {
      commands: {
        default: ['npm install -g @openai/codex'],
      },
      helpUrl: 'https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started',
    },
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    kind: 'cli',
    command: 'opencode',
    iconId: 'opencode',
    install: {
      commands: {
        default: ['npm install -g opencode-ai'],
      },
      helpUrl: 'https://opencli.co/cli/opencode',
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    kind: 'cli',
    command: 'gemini',
    iconId: 'gemini',
    install: {
      commands: {
        default: ['npm install -g @google/gemini-cli'],
      },
      helpUrl: 'https://github.com/google-gemini/gemini-cli',
    },
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    kind: 'cli',
    command: 'cursor-agent',
    commands: ['cursor-agent', 'cursor'],
    iconId: 'cursor',
    install: {
      commands: {
        default: ['curl https://cursor.com/install -fsS | bash'],
        win32: ['curl.exe https://cursor.com/install -fsS | bash'],
      },
      helpUrl: 'https://docs.cursor.com/en/cli/installation',
    },
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    kind: 'cli',
    command: 'kimi',
    iconId: 'kimi',
    install: {
      commands: {
        darwin: ['curl -LsSf https://code.kimi.com/install.sh | bash'],
        linux: ['curl -LsSf https://code.kimi.com/install.sh | bash'],
        win32: [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://code.kimi.com/install.ps1 | iex"',
        ],
      },
      helpUrl: 'https://www.kimi.com/code/docs/en/',
    },
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    kind: 'cli',
    command: 'copilot',
    iconId: 'copilot',
    install: {
      commands: {
        darwin: ['brew install copilot-cli', 'curl -fsSL https://gh.io/copilot-install | bash'],
        linux: ['brew install copilot-cli', 'curl -fsSL https://gh.io/copilot-install | bash'],
        win32: ['winget install GitHub.Copilot.Prerelease'],
      },
      helpUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli',
    },
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    kind: 'cli',
    command: 'agy',
    commands: ['agy', 'antigravity'],
    iconId: 'antigravity',
    install: {
      commands: {
        darwin: ['curl -fsSL https://antigravity.google/cli/install.sh | bash'],
        linux: ['curl -fsSL https://antigravity.google/cli/install.sh | bash'],
        win32: [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://antigravity.google/cli/install.ps1 | iex"',
        ],
      },
      helpUrl: 'https://www.antigravity.google/product/antigravity-cli',
    },
  },
]

export function connectorRuntimeCatalog(): ConnectorRuntimeCatalogEntry[] {
  return CONNECTOR_RUNTIME_CATALOG.map((entry) => ({ ...entry }))
}

export function connectorRuntimeById(
  runtimeId: string | null | undefined,
): ConnectorRuntimeCatalogEntry | null {
  if (!runtimeId) return null
  return CONNECTOR_RUNTIME_CATALOG.find((entry) => entry.id === runtimeId) ?? null
}

function currentRuntimePlatform(): ConnectorRuntimePlatform {
  return typeof process !== 'undefined' && process.platform ? process.platform : 'default'
}

export function connectorRuntimeInstallCommands(
  runtimeId: string,
  targetPlatform: ConnectorRuntimePlatform = currentRuntimePlatform(),
): string[] {
  const runtime = connectorRuntimeById(runtimeId)
  if (!runtime) return []
  const commands = runtime.install.commands
  return commands?.[targetPlatform] ?? commands?.default ?? []
}

export function connectorRuntimeInstallCommand(
  runtimeId: string,
  targetPlatform: ConnectorRuntimePlatform = currentRuntimePlatform(),
): string | null {
  return connectorRuntimeInstallCommands(runtimeId, targetPlatform)[0] ?? null
}
