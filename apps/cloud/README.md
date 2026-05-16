# shadowob-cloud

Deploy AI agents to Kubernetes with a single command.

```bash
shadowob-cloud init --template gstack-buddy
shadowob-cloud validate
shadowob-cloud up
```

## Install

```bash
npm install -g @shadowob/cloud
# or
pnpm add -g @shadowob/cloud
```

Verify:

```bash
shadowob-cloud --version
shadowob-cloud doctor      # checks kubectl, docker, pulumi
```

## Getting Started

### 1. Create a config

```bash
shadowob-cloud init                          # interactive — creates shadowob-cloud.json
shadowob-cloud init --template gstack-buddy  # from a preset template
shadowob-cloud init --list                   # list all available templates
```

### 2. Set API keys

Templates use `${env:VAR_NAME}` to reference secrets. Set the required keys before deploying:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

### 3. Validate

```bash
shadowob-cloud validate                   # schema + security + template ref checks
shadowob-cloud validate --strict          # also fails on unresolvable env vars
```

### 4. Deploy

```bash
shadowob-cloud up                         # deploy to your current kubectl context
shadowob-cloud up --local                 # spin up a local Kind cluster first
```

### 5. Monitor

```bash
shadowob-cloud status                     # deployments & pods overview
shadowob-cloud logs <agent-id>            # stream agent logs
shadowob-cloud dashboard                  # open the web dashboard
```

### 6. Manage

```bash
shadowob-cloud scale <agent-id> --replicas 3
shadowob-cloud down                       # tear down all resources
```

## Templates

Pre-built agent team templates:

| Template | Agents | Description |
|---|---|---|
| `gstack-buddy` | 1 | Product strategy, office hours, CEO review, retros |
| `google-workspace-buddy` | 1 | Gmail, Calendar, Drive, Docs, and Sheets operations through `gws` |
| `superpowers-buddy` | 1 | Specs, TDD, planning, subagent execution, code review |
| `everything-claude-code-buddy` | 1 | Broad engineering harness with skills, commands, agents, hooks |
| `marketingskills-buddy` | 1 | CRO, copy, SEO, paid, email, and growth skills |
| `seomachine-buddy` | 1 | Keyword research, content briefs, on-page audits |
| `scientific-skills-buddy` | 1 | Scientific research, data analysis, and writing skills |

Write your own — see [Config Reference](#config-reference) below.

## CLI Commands

| Command | Description |
|---|---|
| `shadowob-cloud init` | Generate an `shadowob-cloud.json` config |
| `shadowob-cloud validate` | Validate config (schema, security, refs) |
| `shadowob-cloud up` | Deploy agents to Kubernetes |
| `shadowob-cloud down` | Destroy all deployed resources |
| `shadowob-cloud status` | Show deployment & pod status |
| `shadowob-cloud logs <id>` | Stream agent logs |
| `shadowob-cloud scale <id>` | Scale agent replicas |
| `shadowob-cloud dashboard` | Open web dashboard |
| `shadowob-cloud serve` | Start API server + dashboard |
| `shadowob-cloud generate manifests` | Export K8s manifests (offline) |
| `shadowob-cloud generate openclaw-config` | Export OpenClaw configs (debug) |
| `shadowob-cloud doctor` | Check prerequisites |
| `shadowob-cloud build` | Build Docker images for Git agents |
| `shadowob-cloud images` | Manage runner images |
| `shadowob-cloud cluster init` | Bootstrap k3s on bare servers |
| `shadowob-cloud cluster import` | Register an existing kubeconfig locally |
| `shadowob-cloud cluster status` | Check SSH + k3s health on all nodes |
| `shadowob-cloud cluster list` | List all registered clusters |
| `shadowob-cloud cluster kubeconfig <name>` | Print kubeconfig path |
| `shadowob-cloud cluster destroy` | Uninstall k3s and remove local files |

## Bare-Server Cluster Management

Deploy to cloud servers (Ubuntu/Debian) over SSH with a single command — no existing K8s required.

### How it works

1. `cluster init` — SSH into each server, install k3s, form the cluster, store kubeconfig at `~/.shadow-cloud/clusters/<name>.yaml`
2. `up --cluster <name>` — Pulumi uses the stored kubeconfig to deploy agents to that cluster

### 1. Write a cluster.json

```jsonc
{
  "name": "prod",
  "install": {
    "k3sVersion": "v1.35.4+k3s1",
    "k3sMirror": "cn",
    "systemDefaultRegistry": "registry.cn-hangzhou.aliyuncs.com",
    "pauseImage": "registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6"
  },
  "nodes": [
    {
      "role": "master",
      "host": "1.2.3.4",
      "user": "root",
      "sshKeyPath": "~/.ssh/id_rsa"
    },
    {
      "role": "worker",
      "host": "1.2.3.5",
      "user": "root",
      "password": "${env:SERVER_PASSWORD}"
    }
  ]
}
```

Credentials never stored on disk — use `${env:VAR}` for passwords.

`install` is optional. Use it when a server cannot reliably reach GitHub releases, or when you need
repeatable cluster builds:

| Field | Meaning |
| --- | --- |
| `k3sVersion` | Pins the k3s release. With Rancher's China mirror, `v1.35.4+k3s1` is normalized to the mirror's `v1.35.4-k3s1` path. |
| `k3sMirror` | Shortcut mirror name. `cn` maps to `https://rancher-mirror.rancher.cn/k3s`. |
| `k3sArtifactUrl` | Full artifact URL prefix passed to `INSTALL_K3S_ARTIFACT_URL`. |
| `k3sChannel` / `k3sChannelUrl` | Channel lookup settings for the official installer when not pinning a version. |
| `systemDefaultRegistry` | Registry prefix passed as `--system-default-registry` for bundled k3s system images. If omitted with `k3sMirror: "cn"`, Shadow uses `registry.cn-hangzhou.aliyuncs.com`. |
| `pauseImage` | k3s sandbox pause image passed as `--pause-image`. If omitted with `k3sMirror: "cn"`, Shadow uses `registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6` so Pod sandbox creation does not depend on Docker Hub. |

Environment variables override the same installer settings:
`INSTALL_K3S_VERSION`, `INSTALL_K3S_ARTIFACT_URL`, `INSTALL_K3S_CHANNEL`, and
`INSTALL_K3S_CHANNEL_URL`. `INSTALL_K3S_MIRROR=cn` is also accepted for local testing.
Use `INSTALL_K3S_PAUSE_IMAGE` or `K3S_PAUSE_IMAGE` to override the pause image, and
`INSTALL_K3S_SYSTEM_DEFAULT_REGISTRY` or `K3S_SYSTEM_DEFAULT_REGISTRY` to override the system image
registry.

### 2. Bootstrap k3s

```bash
shadowob-cloud cluster init                        # default: reads cluster.json
shadowob-cloud cluster init --config my-cluster.json
shadowob-cloud cluster init --force                # reinstall k3s even if already present
```

**Re-initializing safely:** If k3s is already installed on a node, `init` skips that node by default. Pass `--force` to fully reinstall (uninstalls first, then reinstalls).

### 3. Deploy agents

```bash
shadowob-cloud up --cluster prod
shadowob-cloud up --cluster prod --stack prod      # use a named Pulumi stack
shadowob-cloud up --cluster prod --skip-provision  # skip Shadow resource provisioning
```

### 4. Manage the cluster

```bash
shadowob-cloud cluster status                      # SSH health + k3s version on each node
shadowob-cloud cluster list                        # list all registered clusters
shadowob-cloud cluster kubeconfig prod             # print kubeconfig path (use with kubectl)

export KUBECONFIG=$(shadowob-cloud cluster kubeconfig prod)
kubectl get pods -n my-team
```

### 5. Share cluster access across machines

Another developer on a different machine can register the same cluster without running `init` again:

```bash
# On any machine that has the kubeconfig file:
shadowob-cloud cluster import --name prod --file ./prod.yaml
shadowob-cloud up --cluster prod
```

### 6. Tear down

```bash
shadowob-cloud cluster destroy                     # confirms prompt
shadowob-cloud cluster destroy --yes               # skip confirmation
```

Runs `k3s-uninstall.sh` (master) and `k3s-agent-uninstall.sh` (workers) over SSH, then removes `~/.shadow-cloud/clusters/prod.*`.

## Use `cluster.json` With Web SaaS

The Web SaaS UI in `apps/web` deploys through `apps/server`. By default, those deployments use the
server process's ambient Kubernetes target (`KUBECONFIG`). You can now point the server at the same
`cluster.json` used by the CLI:

1. Bootstrap or register the cluster:

```bash
shadowob-cloud cluster init --config cluster.json
# or, if another machine already bootstrapped it:
shadowob-cloud cluster import --name prod --file ./prod.yaml
```

2. Configure the server environment:

```env
CLOUD_SAAS_CLUSTER_CONFIG_HOST_PATH=/absolute/host/path/to/cluster.json
CLOUD_SAAS_CLUSTER_CONFIG=/app/cluster.json
CLOUD_SAAS_CLUSTER_KUBECONFIG_HOST_PATH=/absolute/host/path/to/prod.yaml
CLOUD_SAAS_CLUSTER_KUBECONFIG=/home/node/.shadow-cloud/clusters/prod.yaml
CLOUD_SAAS_WORKLOAD_BACKEND=deployment
SHADOW_AGENT_SERVER_URL=https://shadow.example.com
PULUMI_CONFIG_PASSPHRASE=change-me
```

On startup, `apps/server` reads `CLOUD_SAAS_CLUSTER_CONFIG`, resolves the cluster name to the stored
kubeconfig, sets `KUBECONFIG` for the embedded Cloud deployment processor, and fails fast if the
kubeconfig is missing.

This config controls where the server deploys workloads. If a template's agent needs Kubernetes
access at runtime, still provide `KUBECONFIG_B64` through the Cloud SaaS env var flow.

`CLOUD_SAAS_WORKLOAD_BACKEND=deployment` is the safe default for vanilla k3s clusters created from
`cluster.json`. Use `agent-sandbox` only on clusters where the `SandboxTemplate`/`SandboxClaim` CRDs
and controller are already installed.

For Docker Compose, mount both files into the server container:

```yaml
services:
  server:
    environment:
      CLOUD_SAAS_CLUSTER_CONFIG: /app/cluster.json
      CLOUD_SAAS_CLUSTER_KUBECONFIG: /home/node/.shadow-cloud/clusters/prod.yaml
      CLOUD_SAAS_WORKLOAD_BACKEND: deployment
    volumes:
      - ./cluster.json:/app/cluster.json:ro
      - ~/.shadow-cloud/clusters/prod.yaml:/home/node/.shadow-cloud/clusters/prod.yaml:ro
```

Then start the product stack and deploy from Web at `/app/cloud`.

## Dashboard

```bash
shadowob-cloud dashboard    # builds (if needed) and opens the web UI
```

**Pages:** Templates (browse & one-click deploy), Overview (deployment status), Settings (API keys & cluster config). Deploy progress is streamed in real-time via SSE.

## Config Reference

### File structure

```jsonc
{
  "version": "1",
  "name": "My Agent Team",
  "description": "What this team does",

  // Shadow server/channel/buddy config
  "plugins": {
    "shadowob": {
      "servers": [{ "id": "srv1", "name": "Server" }],
      "buddies": [{ "id": "bot1", "name": "Bot" }],
      "bindings": [{
        "targetId": "bot1",
        "targetType": "buddy",
        "servers": ["srv1"],
        "channels": ["ch1"],
        "agentId": "my-agent"
      }]
    }
  },

  // AI provider registry
  "registry": {
    "providers": [{
      "id": "anthropic",
      "api": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${env:ANTHROPIC_API_KEY}",
      "models": [{ "id": "claude-sonnet-4-5" }]
    }],
    "configurations": [{
      "id": "base",
      "openclaw": { "tools": [{ "name": "search", "enabled": true }] }
    }]
  },

  // Agent deployments
  "deployments": {
    "namespace": "my-team",
    "agents": [{
      "id": "my-agent",
      "runtime": "openclaw",
      "identity": {
        "name": "Agent Name",
        "systemPrompt": "You are a helpful agent."
      },
      "configuration": { "extends": "base" },
      "resources": {
        "requests": { "cpu": "100m", "memory": "256Mi" },
        "limits": { "cpu": "500m", "memory": "512Mi" }
      }
    }]
  }
}
```

### Template variables

| Syntax | Description |
|---|---|
| `${env:VAR_NAME}` | Environment variable |
| `${secret:k8s/secret-name/key}` | Kubernetes Secret reference |

### API type normalization

| Config value | Normalized to |
|---|---|
| `anthropic` | `anthropic-messages` |
| `openai` | `openai-completions` |
| `google` | `google-generative-ai` |
| `bedrock` | `bedrock-converse-stream` |

### Configuration inheritance

```jsonc
{
  "configuration": {
    "extends": "base",           // inherits from registry.configurations[id="base"]
    "openclaw": {                // deep-merged (arrays replaced, not appended)
      "tools": [{ "name": "extra-tool", "enabled": true }]
    }
  }
}
```

## Managed Agents Features

### Vault — per-agent secret isolation

Each agent can reference a named vault, generating isolated K8s Secrets:

```jsonc
{
  "vaults": {
    "default": {
      "providers": { "anthropic": { "apiKey": "${env:ANTHROPIC_API_KEY}" } },
      "secrets": { "github-token": "${env:GITHUB_TOKEN}" }
    },
    "restricted": {
      "providers": { "anthropic": { "apiKey": "${env:RESTRICTED_KEY}" } }
    }
  },
  "deployments": {
    "agents": [
      { "id": "main-agent", "vault": "default", ... },
      { "id": "sandboxed", "vault": "restricted", ... }
    ]
  }
}
```

### Per-tool permission policies

Control which tools auto-execute vs. require human approval:

```jsonc
{
  "permissions": {
    "default": "approve-reads",
    "tools": {
      "bash": "always-ask",
      "web-fetch": "always-allow",
      "mcp-*": "always-ask"
    },
    "nonInteractive": "deny"
  }
}
```

Levels: `always-allow` | `approve-reads` | `always-ask` | `deny-all`

### Per-agent networking

Each agent gets its own K8s NetworkPolicy:

```jsonc
{
  "networking": {
    "type": "limited",          // "unrestricted" | "limited" | "deny-all"
    "allowedHosts": ["api.anthropic.com"],
    "allowMcpServers": true,
    "allowPackageManagers": false
  }
}
```

### Agent versioning

Version annotations on K8s Deployments for rollback tracking:

```jsonc
{
  "id": "my-agent",
  "version": "1.2.0",
  "changelog": "Added web search tool"
}
```

Generates: `shadowob-cloud/agent-version`, `shadowob-cloud/deployed-at`, `shadowob-cloud/changelog` annotations.

## Security

All pods are hardened by default:

- **Non-root** — `runAsUser: 1000`, `runAsNonRoot: true`
- **Read-only rootfs** — writable only in `/tmp`, `/home/node/.openclaw`, `/var/log/openclaw`
- **Dropped capabilities** — `drop: ["ALL"]`, no privilege escalation
- **Seccomp** — `RuntimeDefault` profile
- **NetworkPolicy** — per-agent deny-all ingress with explicit allow rules
- **Inline key detection** — `shadowob-cloud validate` rejects configs with hardcoded API keys

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │           Interface Layer            │
                    │   ┌──────────┐    ┌──────────────┐  │
                    │   │   CLI    │    │  HTTP/REST   │  │
                    │   │ commands │    │  + Dashboard  │  │
                    │   └────┬─────┘    └──────┬───────┘  │
                    └────────┼─────────────────┼──────────┘
                             │                 │
                    ┌────────▼─────────────────▼──────────┐
                    │           Service Layer (IoC)        │
                    │  ┌────────┐ ┌──────────┐ ┌───────┐  │
                    │  │ Config │ │ Manifest │ │Deploy │  │
                    │  │Service │ │ Service  │ │Service│  │
                    │  ├────────┤ ├──────────┤ ├───────┤  │
                    │  │Provis- │ │ Template │ │  K8s  │  │
                    │  │ioning │ │ Service  │ │Service│  │
                    │  └────────┘ └──────────┘ └───────┘  │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │           Core Modules               │
                    │  config/ infra/ runtimes/ utils/     │
                    └─────────────────────────────────────┘
```

The service layer can be used as a programmatic SDK:

```typescript
import { createContainer } from '@shadowob/cloud'

const container = createContainer()
const config = container.config.parseFile('shadowob-cloud.json')
const resolved = container.config.resolve(config)
const manifests = container.manifest.build({ config: resolved, namespace: 'shadowob-cloud' })
await container.deploy.up({ filePath: 'shadowob-cloud.json' })
```

## Development

```bash
pnpm install
pnpm --filter @shadowob/cloud build             # build CLI
pnpm --filter @shadowob/cloud console:build      # build dashboard
pnpm --filter @shadowob/cloud test               # unit tests
pnpm --filter @shadowob/cloud test:e2e:cli       # CLI E2E tests
```

## License

See [LICENSE](../../LICENSE).
