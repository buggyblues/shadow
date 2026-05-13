# Claude Plugin Importer

Claude Plugin imports Claude Code plugins from GitHub or Git repositories at deployment time. It understands Claude marketplace repositories with `.claude-plugin/marketplace.json` and direct plugin directories with `.claude-plugin/plugin.json`, then normalizes their `skills/`, `commands/`, `agents/`, `.mcp.json`, `.lsp.json`, monitors, hooks, settings, output styles, themes, scripts, and `bin/` tools for Shadow Cloud agents.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | No | Yes | Optional token for private GitHub plugin repositories. |

## Marketplace Import

```json
{
  "plugin": "claude-plugin",
  "options": {
    "marketplaces": [
      {
        "repo": "anthropics/financial-services",
        "plugins": ["pitch-agent", "market-researcher"]
      }
    ]
  }
}
```

## Direct Plugin Or Collection Import

GitHub tree URLs are accepted and converted into `repo` + `ref` + `path` automatically:

```json
{
  "plugin": "claude-plugin",
  "options": {
    "plugins": [
      {
        "url": "https://github.com/anthropics/financial-services/tree/main/plugins/agent-plugins",
        "plugins": ["pitch-agent"]
      }
    ]
  }
}
```

Omit `plugins` to import every plugin found in a marketplace or direct collection.

Declare all Claude plugins for one Shadow agent under a single `claude-plugin` use entry when possible. The runtime importer is agent-scoped, and the K8s adapter emits one init container per agent even when multiple source entries are composed.

## Runtime Assets

- Mounts imported content below `/claude-plugins` by default.
- Writes OpenClaw-readable skill directories to `/claude-plugins/.shadow/skills`.
- Registers discovered Claude commands and skills as Shadow slash commands unless `slashCommands.autoRegister` is `false`.
- Copies Claude plugin `bin/` executables into `/claude-plugins/.shadow/bin` and prepends that directory to `PATH`.
- Preserves LSP, monitor, hook, MCP, settings, output-style, theme, and script descriptors under each imported plugin directory.
- Exposes the mount root and generated command index through `SHADOW_CLAUDE_PLUGIN_*` environment variables.
- Supports optional polling with `poll` for live refresh.

## References

- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
