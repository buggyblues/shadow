# Agent Pack Plugin

Agent Pack mounts reusable agent customization packs from Git repositories at deployment time. It is the mechanism behind community skill stacks, Claude Code style commands, Codex skills, MCP snippets, helper scripts, setup scripts, and sub-agent instruction packs.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | No | Yes | Optional Git token for private HTTPS repositories. |

## Pack Options

| Option | Required | Description |
| --- | --- | --- |
| `packs[].url` | Yes | Git repository URL. HTTPS and SSH sources are supported. |
| `packs[].ref` | No | Branch, tag, or commit SHA. Defaults to `main`. |
| `packs[].autoImport` | No | Standard layout profile selection: `standard`, `claude`, `codex`, `mcp`, `scripts`, or `legacy-broad`. |
| `packs[].mounts` | No | Explicit repo paths to import when a project uses a custom layout. |
| `packs[].tokenSecret` | No | Kubernetes secret name or `${env:VAR}` for private HTTPS access. |
| `packs[].sshKeySecret` | No | Kubernetes secret name containing an SSH private key. |
| `slashCommands.*` | No | Controls automatic slash-command registration for imported commands, skills, and scripts. |

## Setup

1. Pick an upstream repo that contains agent-compatible assets.
2. Use standards-based auto-import for known layouts first: Agent Skills, Claude Code, Codex, and MCP files.
3. Add explicit `mounts` only when the repository uses custom paths.
4. Add `GITHUB_TOKEN`, `tokenSecret`, or `sshKeySecret` only for private repositories.
5. Enable script import only for repositories you trust.
6. Deploy the Buddy and verify the mounted skills, commands, agents, MCP files, and helper scripts.

## Runtime Assets

- Mounts imported content below `/agent-packs` by default.
- Wires `skills`, `commands`, and `agents` into OpenClaw skill loading.
- Exposes imported instructions, hooks, MCP fragments, scripts, and files through `SHADOWOB_PACK_*` environment variables.
- Generates lightweight skill wrappers for imported scripts when enabled.

## References

- [Agent Skills](https://developers.openai.com/codex/skills)
- [Claude Code settings and commands](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Model Context Protocol](https://modelcontextprotocol.io/)
