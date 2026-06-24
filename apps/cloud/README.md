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
  "features": {
    "sandbox": {
      "enabled": true,
      "version": "v0.4.5",
      // Optional: use your mirrored image when registry.k8s.io is unreachable.
      "controllerImage": "registry.example.cn/agent-sandbox/agent-sandbox-controller:v0.4.5",
      "runtimeClassName": "shadow-runc",
      "createRuntimeClass": true,
      "runtimeClassHandler": "runc",
      "nodeSelector": { "shadowob.com/sandbox-ready": "true" },
      "smokeTest": false
    }
  },
  "nodes": [
    {
      "role": "master",
      "host": "1.2.3.4",
      "user": "root",
      "sshKeyPath": "~/.ssh/id_rsa",
      "sshKeyPassphrase": "${env:SSH_KEY_PASSPHRASE}"
    },
    {
      "role": "worker",
      "host": "1.2.3.5",
      "user": "root",
      "sshAgent": true,
      "install": {
        "k3sMirror": "cn",
        "systemDefaultRegistry": "registry.cn-hangzhou.aliyuncs.com"
      },
      "region": "cn",
      "features": { "sandbox": true },
      "labels": { "shadowob.com/region": "cn" }
    }
  ]
}
```

Credentials never stored on disk. Use `${env:VAR}` for passwords and key passphrases. For encrypted
keys already loaded into `ssh-agent`, set `"sshAgent": true`; if the agent socket is mounted at a
custom path, set `"sshAgent": "/path/to/agent.sock"` or `"${env:SSH_AUTH_SOCK}"`.

`install` is optional. Set it at the cluster level for shared defaults, or on an individual node to
override those defaults. Node-level overrides are useful for mixed-region clusters where, for
example, China nodes need domestic mirrors while overseas nodes can use the upstream defaults.

| Field | Meaning |
| --- | --- |
| `k3sVersion` | Pins the k3s release. With Rancher's China mirror, `v1.35.4+k3s1` is normalized to the mirror's `v1.35.4-k3s1` path. |
| `k3sMirror` | Shortcut mirror name. `cn` maps to `https://rancher-mirror.rancher.cn/k3s`. |
| `k3sArtifactUrl` | Full artifact URL prefix passed to `INSTALL_K3S_ARTIFACT_URL`. |
| `k3sChannel` / `k3sChannelUrl` | Channel lookup settings for the official installer when not pinning a version. |
| `systemDefaultRegistry` | Registry prefix passed as `--system-default-registry` for bundled k3s system images. If omitted with `k3sMirror: "cn"`, Shadow uses `registry.cn-hangzhou.aliyuncs.com`. |
| `pauseImage` | k3s sandbox pause image passed as `--pause-image`. If omitted with `k3sMirror: "cn"`, Shadow uses `registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6` so Pod sandbox creation does not depend on Docker Hub. |

`features.sandbox` makes agent-sandbox a managed cluster capability. `true` is shorthand for the
default pinned install. During `cluster init` and `cluster apply`, Shadow applies the upstream
agent-sandbox core and extensions manifests, optionally rewrites the controller image to a private
or domestic registry, creates/verifies the configured RuntimeClass, waits for the CRDs/controller,
labels Kubernetes nodes with `shadowob.com/sandbox-ready`, optionally runs a real
SandboxTemplate/SandboxClaim smoke test, and stores the capability plus a cluster config hash in
`~/.shadow-cloud/clusters/<name>.json`.

By default the managed RuntimeClass is `shadow-runc` with handler `runc`, so a vanilla k3s node can
run sandbox workloads immediately. For stronger isolation, install gVisor/runsc on the nodes and set
`runtimeClassName: "gvisor"`, `createRuntimeClass: false` if the class already exists, or
`runtimeClassHandler: "runsc"` if Shadow should create it. For restricted networks, mirror
`https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.4.5/manifest.yaml` and
`extensions.yaml`, then set `manifestUrls` to the mirrored URLs.

For workload registry mirrors, add `install.registries`; Shadow writes it to k3s
`/etc/rancher/k3s/registries.yaml` on every configured node before install/apply:

```jsonc
{
  "install": {
    "registries": {
      "mirrors": {
        "docker.io": { "endpoint": ["https://docker.mirror.example.cn"] },
        "registry.k8s.io": { "endpoint": ["https://registry-k8s.mirror.example.cn"] }
      },
      "configs": {
        "registry.example.cn": {
          "auth": {
            "username": "${env:REGISTRY_USER}",
            "password": "${env:REGISTRY_PASSWORD}"
          }
        }
      }
    }
  }
}
```

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
shadowob-cloud cluster apply --config cluster.json # same idempotent apply path
shadowob-cloud cluster init --force                # reinstall k3s even if already present
```

**Re-initializing safely:** If k3s is already installed on a node, `init`/`apply` skips that node by
default. To expand a cluster, add the new worker to `nodes`, keep the existing master in the file,
and run `shadowob-cloud cluster apply --config cluster.json`. Shadow reads the existing master token,
installs k3s only on newly listed workers, joins them to the cluster, and refreshes the registered
kubeconfig metadata. Pass `--force` only when you intentionally want to reinstall listed nodes.

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
KUBECONFIG_HOST_PATH=/absolute/host/path/to/prod.yaml
KUBECONFIG_CONTAINER_PATH=/home/node/.shadow-cloud/clusters/prod.yaml
KUBECONFIG_CONTEXT=
CLOUD_SAAS_CLUSTER_CONFIG_HOST_PATH=/absolute/host/path/to/cluster.json
CLOUD_SAAS_CLUSTER_CONFIG=/app/cluster.json
CLOUD_SAAS_CLUSTER_KUBECONFIG_HOST_PATH=/absolute/host/path/to/prod.yaml
CLOUD_SAAS_CLUSTER_KUBECONFIG=/home/node/.shadow-cloud/clusters/prod.yaml
CLOUD_SAAS_WORKLOAD_BACKEND=auto
SHADOWOB_SERVER_URL=https://shadow.example.com
SHADOWOB_PROVISION_URL=http://server:3002
SHADOWOB_OPENCLAW_RUNNER_IMAGE=ghcr.io/buggyblues/openclaw-runner:latest
PULUMI_CONFIG_PASSPHRASE=change-me
```

On startup, `apps/server` reads `CLOUD_SAAS_CLUSTER_CONFIG`, resolves the cluster name to the stored
kubeconfig, sets `KUBECONFIG` for the embedded Cloud deployment processor, and fails fast if the
kubeconfig is missing.

When running the production compose stack as the non-root `node` user, the mounted files must be
readable by UID 1000 inside the container. For root-owned host files, use either `chown 1000:1000`
with `chmod 600`, or `chmod 644` for non-secret cluster metadata. Do not mount a missing host file:
Docker will create a directory at the target path, which later fails as `EISDIR: illegal operation on
a directory, read`.

The server container must be able to reach the Kubernetes API in the kubeconfig. For a remote k3s
node, open TCP `6443` from the Shadow server host, or use an SSH tunnel and set the kubeconfig
`server` to the tunnel endpoint with `tls-server-name` pointing at the original API hostname/IP.

`SHADOWOB_SERVER_URL` is the URL injected into pods. It must be reachable from the k3s nodes and
from the workload pods. `http://host.lima.internal:3002` is only valid for local Lima/Rancher
Desktop style development; remote clusters should use the public Shadow origin, for example
`https://shadowob.com`. Use `SHADOWOB_PROVISION_URL=http://server:3002` only when the Cloud worker
needs a different host-side URL for provisioning API calls.

Official Cloud SaaS model-provider deployments use `SHADOWOB_SERVER_URL` as the base URL for the
Shadow model proxy (`/api/ai/v1`). If only an internal Docker/Lima address is configured, deployment
creation fails fast with a `SHADOWOB_SERVER_URL` configuration error instead of writing an
unreachable proxy URL into the workload ConfigMap.

For China-based worker nodes, k3s system images and workload images are separate concerns:

- Use `install.k3sMirror: "cn"`, `systemDefaultRegistry`, and `pauseImage` for k3s system images.
- Ensure `SHADOWOB_OPENCLAW_RUNNER_IMAGE` points to an image reachable by the worker nodes, or
  pre-load the image into containerd and use a local tag such as `shadowob/openclaw-runner:local`.
- Prefer a real private registry mirror for production. Pre-loading is useful for a single-node
  emergency fix, but it must be repeated whenever the runner image changes.

With the production compose file, the effective update flow is:

```bash
docker-compose -f docker-compose.prod.yml pull server web admin
docker-compose -f docker-compose.prod.yml up -d --remove-orphans
```

After changing `.env`, run at least `docker-compose -f docker-compose.prod.yml up -d server` so the
server process picks up the new Kubernetes and pod-facing URL settings.

This config controls where the server deploys workloads. If a template's agent needs Kubernetes
access at runtime, still provide `KUBECONFIG_B64` through the Cloud SaaS env var flow.

`CLOUD_SAAS_WORKLOAD_BACKEND=auto` lets `cluster.json` decide the default backend: if
`features.sandbox` is enabled, Web SaaS injects `deployments.backend=agent-sandbox` plus the
configured sandbox RuntimeClass and node selector; otherwise it injects `deployment` as the fallback.
Deployments then run a real preflight before Pulumi applies resources. Set
`CLOUD_SAAS_WORKLOAD_BACKEND=deployment` only as an emergency override.

Cloud configs can make fallback behavior explicit with `deployments.backendPolicy`:

- `sandbox-required`: fail fast if CRDs/controller/RuntimeClass are not ready.
- `sandbox-preferred`: use sandbox when preflight passes, otherwise fall back to Deployment.
- `deployment-only`: always use Deployment.

For Docker Compose, mount both files into the server container:

```yaml
services:
  server:
    environment:
      KUBECONFIG: /home/node/.shadow-cloud/clusters/prod.yaml
      CLOUD_SAAS_CLUSTER_CONFIG: /app/cluster.json
      CLOUD_SAAS_CLUSTER_KUBECONFIG: /home/node/.shadow-cloud/clusters/prod.yaml
      CLOUD_SAAS_WORKLOAD_BACKEND: auto
      SHADOWOB_OPENCLAW_RUNNER_IMAGE: ghcr.io/buggyblues/openclaw-runner:latest
    volumes:
      - ./cluster.json:/app/cluster.json:ro
      - ~/.shadow-cloud/clusters/prod.yaml:/home/node/.shadow-cloud/clusters/prod.yaml:ro
```

Then start the product stack and deploy from Web at `/app/cloud`.

### Expanding a Web SaaS Cluster

To add a new node, edit the same `cluster.json` mounted into the server and add a new `worker` entry
under `nodes`. Keep the existing master entry in the file, then apply it from a machine/container
that can SSH to every node:

```bash
shadowob-cloud cluster apply --config /workspace/shadow/ops/prod-cn-cluster.json
```

`apply` skips nodes where k3s is already installed, reads the master token, installs k3s only on new
workers, joins them to the cluster, and refreshes the stored kubeconfig metadata.

If you run the CLI from a Docker image and your SSH key is encrypted, either pass
`sshKeyPassphrase: "${env:SSH_KEY_PASSPHRASE}"` in the node config, or use `sshAgent: true` and mount
the agent socket:

```bash
docker run --rm --user root --network host \
  -e SSH_AUTH_SOCK=/ssh-agent \
  -v "$SSH_AUTH_SOCK:/ssh-agent" \
  -v /root/.shadow-cloud:/root/.shadow-cloud \
  -v /workspace/shadow/ops/prod-cn-cluster.json:/cluster.json:ro \
  ghcr.io/buggyblues/shadow-server:latest \
  node /app/apps/cloud/dist/cli.js cluster apply --config /cluster.json
```

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
