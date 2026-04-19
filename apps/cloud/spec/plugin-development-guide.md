# Shadow Cloud Plugin Development Guide

> Complete reference for developing Shadow Cloud plugins.

## 1. Quick Start

Create a new plugin in **3 files**:

```
src/plugins/my-service/
├── manifest.json    # Plugin metadata
├── index.ts         # Plugin definition (required)
└── schema.ts        # TypeScript types (optional)
```

### Step 1: Create `manifest.json`

```json
{
  "id": "my-service",
  "name": "My Service",
  "description": "Connect agents to My Service for task management",
  "version": "1.0.0",
  "category": "productivity",
  "icon": "clipboard-list",
  "website": "https://myservice.com",
  "docs": "https://docs.myservice.com/api",

  "auth": {
    "type": "api-key",
    "fields": [
      {
        "key": "MY_SERVICE_API_KEY",
        "label": "API Key",
        "description": "Generate at https://myservice.com/settings/api",
        "required": true,
        "sensitive": true,
        "placeholder": "ms_key_..."
      }
    ]
  },

  "config": {
    "type": "object",
    "properties": {
      "workspace": {
        "type": "string",
        "description": "Workspace ID to connect to"
      },
      "syncInterval": {
        "type": "number",
        "default": 300,
        "description": "Sync interval in seconds"
      }
    },
    "required": ["workspace"]
  },

  "capabilities": ["tool", "data-source"],
  "tags": ["productivity", "tasks"],
  "popularity": 50
}
```

### Step 2: Create `index.ts`

```typescript
import type { PluginDefinition } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = {
  manifest,

  // ── Config Builder: returns an OpenClaw config fragment ──
  configBuilder: {
    build(agentConfig, context) {
      return {
        plugins: {
          entries: {
            'my-service': {
              enabled: true,
              config: {
                workspace: agentConfig.workspace,
                apiKey: `\${env:MY_SERVICE_API_KEY}`,
              },
            },
          },
        },
      }
    },
  },

  // ── Env Provider: injects environment variables for the agent ──
  env: {
    build(agentConfig, _context) {
      return {
        MY_SERVICE_WORKSPACE: String(agentConfig.workspace),
      }
    },
  },

  // ── Validation Provider: checks required config before deploy ──
  validation: {
    validate(agentConfig, _context) {
      const errors = []
      if (!agentConfig.workspace) {
        errors.push({
          path: 'config.workspace',
          message: 'Workspace ID is required',
          severity: 'error' as const,
        })
      }
      return { valid: errors.length === 0, errors }
    },
  },
}

export default plugin
```

### Step 3: Use in config

```json
{
  "use": [
    {
      "plugin": "my-service",
      "options": {
        "workspace": "ws_abc123"
      }
    }
  ]
}
```

> **Legacy format:** The older `plugins` map format is still supported for backward compatibility, but new configs should use the `use` array above.

```json
{
  "plugins": {
    "my-service": {
      "enabled": true,
      "secrets": {
        "MY_SERVICE_API_KEY": "${env:MY_SERVICE_API_KEY}"
      },
      "config": {
        "workspace": "ws_abc123"
      }
    }
  }
}
```

---

## 2. Plugin Manifest Reference

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier, lowercase, kebab-case (e.g., `"google-calendar"`) |
| `name` | `string` | Display name (e.g., `"Google Calendar"`) |
| `description` | `string` | One-line description |
| `version` | `string` | Semver version |
| `category` | `PluginCategory` | Plugin category (see categories below) |
| `icon` | `string` | Icon name from lucide-react or custom SVG path |
| `auth` | `PluginAuth` | Authentication configuration |
| `capabilities` | `PluginCapability[]` | What the plugin provides |
| `tags` | `string[]` | Searchable tags |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `website` | `string` | Service website URL |
| `docs` | `string` | API documentation URL |
| `config` | `JsonSchema` | Plugin-specific config schema |
| `popularity` | `number` | 0-100 rank for store sorting |

### Categories

```
communication      — Slack, Discord, Telegram, LINE, Shadowob
project-management — Asana, Linear, ClickUp, monday.com, Jira
ai-provider        — OpenAI, Anthropic, Google Gemini, Cohere
devops             — Vercel, Cloudflare, Sentry, PostHog
database           — Supabase, Neon, Prisma, Airtable
productivity       — Notion, Google Drive, Dropbox, Todoist
automation         — Zapier, Make, n8n, Dify
crm                — HubSpot, Close, Intercom, Apollo
finance            — Stripe, PayPal, Xero, RevenueCat
analytics          — PostHog, Metabase, Ahrefs, Similarweb
media              — ElevenLabs, HeyGen, Canva, Flux
email              — Gmail, Outlook Mail, Mailchimp
calendar           — Google Calendar, Outlook Calendar
search             — Perplexity, Firecrawl
code               — GitHub, Phabricator
other              — Anything else
```

### Capabilities

```
channel        — Bidirectional message channel (OpenClaw channel plugin)
tool           — Provides MCP tools to agents (most common)
notification   — Outbound notification delivery
webhook        — Inbound webhook receiver
data-source    — Read-only data fetching
action         — Execute actions on external service
auth-provider  — Provides auth tokens to other plugins
```

### Auth types

```
api-key  — Single API key (most services): Stripe, Notion, PostHog
token    — Bearer/bot token: Slack bot token, GitHub PAT
oauth2   — OAuth 2.0 flow: Google, Slack app, GitHub App
basic    — Username + password: some legacy APIs
none     — No auth required: public APIs, self-hosted services
```

---

## 3. Plugin Hooks Reference

### `buildOpenClawConfig(agentConfig, context): PluginConfigFragment`

**When:** Called at build time for each agent that has this plugin enabled.

**Purpose:** Return OpenClaw config fragments to merge into the agent's final config.

**Example — Channel plugin (like Slack):**

```typescript
buildOpenClawConfig(agentConfig, context) {
  const { agent } = context
  return {
    channels: {
      slack: {
        enabled: true,
        accounts: {
          [agent.id]: {
            token: '${env:SLACK_BOT_TOKEN}',
            channels: agentConfig.channels ?? [],
            mentionOnly: agentConfig.mentionOnly ?? true,
          },
        },
      },
    },
    bindings: [
      {
        agentId: agent.id,
        type: 'route',
        match: { channel: 'slack', accountId: agent.id },
      },
    ],
  }
}
```

**Example — Tool plugin (like GitHub):**

```typescript
buildOpenClawConfig(agentConfig, context) {
  return {
    plugins: {
      entries: {
        github: {
          enabled: true,
          config: {
            org: agentConfig.org,
            repos: agentConfig.repos,
            token: '${env:GITHUB_TOKEN}',
          },
        },
      },
    },
  }
}
```

### `buildEnvVars(agentConfig, context): Record<string, string>`

**When:** Called at build time for each agent.

**Purpose:** Return extra env vars to inject into the agent's container.

```typescript
buildEnvVars(agentConfig, context) {
  return {
    GITHUB_ORG: agentConfig.org,
    GITHUB_REPOS: agentConfig.repos.join(','),
    // Secrets are handled separately via manifest.auth.fields
  }
}
```

### `buildK8sResources(agentConfig, context): K8sResource[]`

**When:** Called at build time.

**Purpose:** Return extra K8s manifests (e.g., webhook ingress, CronJob).

```typescript
buildK8sResources(agentConfig, context) {
  if (!agentConfig.webhookEnabled) return []

  return [{
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: `${context.agent.id}-stripe-webhook`,
      namespace: context.namespace,
    },
    spec: {
      rules: [{
        host: agentConfig.webhookDomain,
        http: {
          paths: [{
            path: '/webhook/stripe',
            pathType: 'Prefix',
            backend: {
              service: {
                name: context.agent.id,
                port: { number: 3100 },
              },
            },
          }],
        },
      }],
    },
  }]
}
```

### `provision(agentConfig, context): Promise<PluginProvisionResult>`

**When:** Called during `shadowob-cloud up` or `shadowob-cloud provision`.

**Purpose:** Create/verify external resources, idempotently.

```typescript
async provision(agentConfig, context) {
  const { logger, dryRun, existingState } = context

  if (dryRun) {
    logger.info('Would create Slack channel #agent-updates')
    return { state: {} }
  }

  // Check if already provisioned
  if (existingState?.channelId) {
    logger.dim(`Slack channel already provisioned: ${existingState.channelId}`)
    return { state: existingState }
  }

  // Create resources via API
  const channel = await slackApi.createChannel({
    name: agentConfig.defaultChannel,
    token: context.secrets.SLACK_BOT_TOKEN,
  })

  return {
    state: { channelId: channel.id, createdAt: new Date().toISOString() },
  }
}
```

### `validate(agentConfig, context): PluginValidationResult`

**When:** Called during `shadowob-cloud validate`.

**Purpose:** Validate plugin configuration.

```typescript
validate(agentConfig, context) {
  const errors = []

  if (!agentConfig.channels?.length) {
    errors.push({
      path: 'config.channels',
      message: 'At least one Slack channel is required',
      severity: 'warning',
    })
  }

  // Check secrets are provided
  const token = context.secrets.SLACK_BOT_TOKEN
  if (!token || token.startsWith('${')) {
    errors.push({
      path: 'secrets.SLACK_BOT_TOKEN',
      message: 'Slack bot token is not set',
      severity: 'error',
    })
  }

  return { valid: errors.filter(e => e.severity === 'error').length === 0, errors }
}
```

---

## 4. Config Resolution

### Per-Agent Plugin Config

Each agent's effective plugin config is merged from:

```
1. Plugin defaults (from manifest.json config.properties.*.default)
2. Global plugin config (plugins.{pluginId}.config)
3. Per-agent override (plugins.{pluginId}.agents.{agentId}.config)
```

```typescript
// Resolution pseudocode
function resolveAgentPluginConfig(
  pluginId: string,
  agentId: string,
  config: CloudConfig,
): Record<string, unknown> {
  const pluginConfig = config.plugins?.[pluginId]
  if (!pluginConfig?.enabled) return null

  const globalConfig = pluginConfig.config ?? {}
  const agentOverride = pluginConfig.agents?.[agentId]

  if (agentOverride?.enabled === false) return null

  return deepMerge(globalConfig, agentOverride?.config ?? {})
}
```

### Secret Resolution

Secrets are resolved in order:

```
1. plugins.{pluginId}.secrets         — explicit per-plugin secrets
2. ~/.shadowob/secrets.json           — local secret store
3. K8s Secrets in namespace           — cluster secrets
4. Environment variables              — process.env
```

---

## 5. Testing Your Plugin

### Unit Test Template

```typescript
import { describe, expect, it } from 'vitest'
import plugin from './index.js'

describe('my-service plugin', () => {
  it('has valid manifest', () => {
    expect(plugin.manifest.id).toBe('my-service')
    expect(plugin.manifest.auth.fields.length).toBeGreaterThan(0)
    expect(plugin.manifest.capabilities).toContain('tool')
  })

  it('builds OpenClaw config', () => {
    const fragment = plugin.buildOpenClawConfig?.(
      { workspace: 'ws_123' },
      { agent: { id: 'test-agent' }, config: {}, secrets: {}, namespace: 'test' },
    )
    expect(fragment?.plugins?.entries?.['my-service']?.enabled).toBe(true)
  })

  it('validates config', () => {
    const result = plugin.validate?.({}, { secrets: {} })
    expect(result?.valid).toBe(false)
    expect(result?.errors).toHaveLength(1)
  })
})
```

### Integration Test

```typescript
it('produces valid K8s manifests', async () => {
  const resources = plugin.buildK8sResources?.(
    { workspace: 'ws_123', webhookEnabled: true, webhookDomain: 'hooks.example.com' },
    { agent: { id: 'assistant' }, namespace: 'test-ns', ... },
  )
  expect(resources).toHaveLength(1)
  expect(resources[0].kind).toBe('Ingress')
})
```

---

## 6. Plugin Examples

### Communication Plugin (Slack)

Full implementation: `src/plugins/slack/`

- Capability: `channel`, `notification`
- Auth: `token` (Bot Token)
- buildOpenClawConfig → channels.slack section
- provision → create/join channels via Slack API
- buildEnvVars → SLACK_BOT_TOKEN, SLACK_CHANNELS

### Tool Plugin (GitHub)

Full implementation: `src/plugins/github/`

- Capability: `tool`, `webhook`
- Auth: `token` (PAT or GitHub App)
- buildOpenClawConfig → plugins.entries.github
- buildK8sResources → webhook Ingress (optional)

### Data Source Plugin (PostHog)

Full implementation: `src/plugins/posthog/`

- Capability: `data-source`, `tool`
- Auth: `api-key`
- buildOpenClawConfig → plugins.entries.posthog
- No provisioning needed

### Auth Provider Plugin (OpenAI)

Full implementation: `src/plugins/openai/`

- Capability: `auth-provider`
- Auth: `api-key`
- buildOpenClawConfig → models.providers.openai
- Migrates from current registry.providers pattern

---

## 7. Console Integration

### Plugin Store Page

Each plugin appears in the Console Plugin Store at `/plugins`. The store reads manifests from the plugin registry and displays:

- Icon + name + description
- Category badge
- Auth requirements
- "Enable" button → routes to Plugin Detail page

### Plugin Detail Page

`/plugins/:id` shows:

1. **Overview** — description, capabilities, tags
2. **Setup** — secret fields (from manifest.auth.fields) + config form (from manifest.config)
3. **Per-Agent Config** — enable/disable per agent + agent-specific config
4. **Connection Test** — validate secrets and test connectivity
5. **Documentation** — rendered from plugin README or linked to external docs

### Secrets Manager

`/secrets` provides a unified view of all plugin secrets:

- Grouped by plugin
- Shows which agents use each secret
- Masked values with reveal toggle
- Sync status with K8s cluster

---

## 8. File Naming Conventions

```
src/plugins/{plugin-id}/
├── manifest.json          # Required: plugin metadata
├── index.ts               # Required: PluginDefinition export (default export)
├── schema.ts              # Optional: TypeScript types for config
├── builder.ts             # Optional: complex OpenClaw config builder logic
├── provisioner.ts         # Optional: resource provisioning logic
├── README.md              # Optional: plugin documentation
└── __tests__/             # Optional: plugin-specific tests
    └── {plugin-id}.test.ts
```

- Plugin ID: lowercase, kebab-case (e.g., `google-calendar`)
- One default export per `index.ts`
- Manifests are JSON (not TypeScript) for tooling compatibility
- Secrets never appear in manifest or committed files
