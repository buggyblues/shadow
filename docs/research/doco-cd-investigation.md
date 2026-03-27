# Doco-CD Investigation Report

## Overview

**Doco-CD** is a lightweight GitOps tool for Docker Compose continuous deployment. It provides an alternative to complex CD solutions like ArgoCD or Portainer for Docker Compose-based deployments.

## Project Information

- **Repository**: https://github.com/kimdre/doco-cd
- **Language**: Go (Golang)
- **License**: Apache 2.0
- **Latest Version**: v0.76.0 (as of 2026-03-20)
- **Architecture**: Single binary with minimal resource requirements (distroless image)

## Core Features

### 1. GitOps Deployment Model
- Automatic deployment from Git repositories
- Supports both **webhook triggers** and **polling mechanisms**
- Git reference tracking (branches, tags, commits)
- Multi-document YAML support for multiple deployments

### 2. Deployment Configuration

Doco-CD uses a YAML-based configuration file (`.doco-cd.yaml`) to define deployments:

```yaml
name: my-app
reference: refs/heads/main
working_dir: ./
compose_files:
  - docker-compose.yaml
env_files:
  - .env
remove_orphans: true
prune_images: true
force_recreate: false
force_image_pull: false
timeout: 180
```

### 3. Key Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `name` | Deployment/stack name | required |
| `reference` | Git reference (branch/tag) | `refs/heads/main` |
| `working_dir` | Working directory for deployment | `.` |
| `compose_files` | List of compose files | `["compose.yaml", ...]` |
| `env_files` | Environment files | `[".env"]` |
| `remove_orphans` | Remove orphaned containers | `true` |
| `prune_images` | Clean up unused images | `true` |
| `force_recreate` | Force container recreation | `false` |
| `force_image_pull` | Always pull latest images | `false` |
| `timeout` | Deployment timeout (seconds) | `180` |
| `profiles` | Compose profiles | `[]` |
| `auto_discover` | Auto-discover compose files | `false` |
| `webhook_filter` | Regex filter for webhook events | `""` |
| `destroy` | Remove deployment | `false` |
| `external_secrets` | External secret mappings | `{}` |

### 4. Security Features

- **External Secrets Support**: Integration with secret managers (Bitwarden Secrets Manager, with Vaultwarden support in PR #1096)
- **SOPS Encryption**: Support for encrypted configuration files
- **Webhook Authentication**: HMAC-SHA256 signature validation using WEBHOOK_SECRET
- **SSH/Token-based Git Auth**: Multiple authentication methods (OAuth2, SSH, token)
- **Docker Secrets**: Support for Docker Swarm secrets

### 5. Deployment Modes

#### Docker Compose Mode
- Standard Docker Compose deployments
- Supports profiles and multiple compose files
- Environment variable interpolation
- Build options support (args, no-cache, quiet)

#### Docker Swarm Mode
- Native Swarm stack deployments
- Automatic Swarm detection via DOCKER_SWARM_FEATURES
- Service stack management
- Volume and config management

### 6. Application Configuration

Environment variables for Doco-CD server:

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTP_PORT` | HTTP server port | `80` |
| `METRICS_PORT` | Prometheus metrics port | `9120` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `API_SECRET` | API authentication secret | - (disabled if empty) |
| `WEBHOOK_SECRET` | Webhook validation secret | - (disabled if empty) |
| `GIT_ACCESS_TOKEN` | Git access token (HTTP auth) | - |
| `SSH_PRIVATE_KEY` | SSH private key for Git | - |
| `AUTH_TYPE` | Authentication type (oauth2/ssh/token) | `oauth2` |
| `DEPLOY_CONFIG_BASE_DIR` | Config file search path | `/` |
| `MAX_CONCURRENT_DEPLOYMENTS` | Parallel deployment limit | `4` |
| `MAX_DEPLOYMENT_LOOP_COUNT` | Loop detection threshold | `2` |
| `DOCKER_SWARM_FEATURES` | Enable Swarm mode | `true` |
| `DOCKER_QUIET_DEPLOY` | Suppress deployment output | `true` |
| `PASS_ENV` | Pass env vars to deployment | `false` |
| `SKIP_TLS_VERIFICATION` | Skip TLS for Git | `false` |
| `GIT_CLONE_SUBMODULES` | Clone Git submodules | `true` |
| `MAX_PAYLOAD_SIZE` | Max webhook payload size | `1048576` (1MB) |
| `TZ` | Timezone | `UTC` |

### 7. Notification & Monitoring

- **Apprise Integration**: Multi-channel notifications (Slack, Discord, Email, etc.)
- **Prometheus Metrics**: Built-in metrics endpoint at `/metrics`
- **Health Check Endpoint**: `/v1/health` for load balancers
- **Deployment Loop Detection**: Prevents infinite deployment loops

### 8. Polling Configuration

```yaml
poll_config:
  - name: my-app
    url: https://github.com/user/repo
    ref: refs/heads/main
    interval: 5m
    auth:
      type: oauth2
      token: ${GIT_ACCESS_TOKEN}
```

Polling supports intervals in Go duration format (e.g., `5m`, `1h`, `30s`).

## API Endpoints

### Webhook Endpoints
- `POST /v1/webhook` - Webhook receiver for Git providers

### REST API Endpoints (v1)
- `POST /v1/api/deploy` - Manual deployment trigger
- `POST /v1/api/poll/run` - Trigger poll run (v0.76.0+)
- `GET /v1/health` - Health check
- `GET /v1/metrics` - Prometheus metrics

### Query Parameters
- `wait=true` - Wait for deployment to complete before responding
- `target=<name>` - Target specific deployment configuration

## Architecture Analysis

### Strengths

1. **Lightweight**: Minimal resource footprint (Go-based, distroless image)
2. **Simple**: Single binary, minimal configuration
3. **Flexible**: Supports both webhooks and polling
4. **Secure**: Multiple authentication and encryption options
5. **Observable**: Prometheus metrics and notifications
6. **Concurrent**: Supports parallel deployments with configurable limits
7. **Auto-discovery**: Can discover compose files in subdirectories

### Limitations

1. **Single Node**: No built-in HA or clustering support
2. **No UI**: Command-line/API only (unlike Portainer)
3. **Limited RBAC**: Basic authentication only
4. **Docker Only**: No Kubernetes support
5. **GitHub Timeout**: Webhooks limited to 10 seconds (GitHub limitation)

## Comparison with Alternatives

### Doco-CD vs Flux CD

**Key Difference: Kubernetes Dependency**
- **Doco-CD**: Designed specifically for Docker Compose/Swarm, no Kubernetes required
- **Flux CD**: Kubernetes-native, requires a K8s cluster to run

| Feature | Doco-CD | Flux CD |
|---------|---------|---------|
| **Target Platform** | Docker Compose/Swarm | Kubernetes |
| **Kubernetes Required** | ❌ No | ✅ Yes |
| **Architecture** | Single binary | Kubernetes controllers |
| **Resource Footprint** | Very Low (~MB RAM) | Medium (K8s overhead) |
| **UI** | ❌ CLI/API only | ❌ CLI only (Weave GitOps optional) |
| **Webhook Support** | ✅ Native | ✅ Native |
| **Polling** | ✅ Built-in | ✅ Built-in |
| **Multi-tenancy** | ❌ Basic | ✅ Advanced |
| **RBAC** | ❌ Basic | ✅ Kubernetes RBAC |
| **Secret Management** | Bitwarden, SOPS | SOPS, Vault, AWS SM |
| **Notifications** | ✅ Apprise | ✅ Native |
| **Image Automation** | ❌ Manual | ✅ Automated updates |
| **Corporate Backing** | Community | CNCF Graduated |
| **Future Stability** | Active | Uncertain (Weaveworks shutdown) |

**When to Choose Doco-CD over Flux CD:**
- No Kubernetes infrastructure
- Simple Docker Compose deployments
- Minimal resource requirements
- Quick setup without K8s complexity

**When to Choose Flux CD over Doco-CD:**
- Already using Kubernetes
- Need advanced multi-tenancy
- Require automated image updates
- Enterprise RBAC requirements

### Doco-CD vs ArgoCD

| Feature | Doco-CD | ArgoCD |
|---------|---------|--------|
| **Target Platform** | Docker Compose/Swarm | Kubernetes |
| **Kubernetes Required** | ❌ No | ✅ Yes |
| **UI** | ❌ | ✅ Rich Web UI |
| **Resource Usage** | Low | High |
| **ApplicationSets** | ❌ | ✅ |
| **Sync Windows** | ❌ | ✅ |
| **Rollback** | Manual | ✅ UI/CLI |
| **Complexity** | Low | High |

### Full Comparison Table

| Feature | Doco-CD | Flux CD | ArgoCD | Portainer | Watchtower |
|---------|---------|---------|--------|-----------|------------|
| GitOps | ✅ | ✅ | ✅ | ✅ | ❌ |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ❌ |
| Polling | ✅ | ✅ | ✅ | ✅ | ✅ |
| UI | ❌ | ❌* | ✅ | ✅ | ❌ |
| Docker Compose | ✅ | ❌ | ❌ | ✅ | ✅ |
| Kubernetes | ❌ | ✅ | ✅ | ❌ | ❌ |
| Swarm | ✅ | ❌ | ❌ | ✅ | ❌ |
| Resource Usage | Very Low | Medium | High | Medium | Low |
| Complexity | Low | High | High | Medium | Low |
| Notifications | ✅ (Apprise) | ✅ | ✅ | ✅ | ❌ |
| Metrics | ✅ (Prometheus) | ✅ | ✅ | ✅ | ❌ |
| Image Auto-Update | ❌ | ✅ | ✅ | ❌ | ✅ |
| Multi-tenancy | ❌ | ✅ | ✅ | ❌ | ❌ |

*Flux CD has optional Weave GitOps UI

## Supported Git Providers

- **GitHub** - Full webhook support with HMAC signature
- **GitLab** - Webhook with secret token
- **Gitea** - Native webhook support
- **Forgejo** - Compatible with Gitea webhooks
- **Gogs** - Webhook support
- **Azure DevOps** - Limited support (requires custom pipeline, no native Service Hooks)

## Webhook Security

Doco-CD validates webhooks using HMAC-SHA256:

```
X-Hub-Signature-256: sha256=<hmac_signature>
```

The signature is computed over the request body using the WEBHOOK_SECRET.

## Use Cases

### Ideal For:
- Small to medium Docker Compose deployments
- Self-hosted applications
- Development/staging environments
- Simple CI/CD pipelines
- Edge deployments
- Teams wanting GitOps without Kubernetes complexity

### Not Suitable For:
- Large-scale Kubernetes deployments
- Multi-region deployments requiring coordination
- Complex deployment strategies (canary, blue-green)
- Teams requiring rich UI/RBAC
- Azure DevOps native integration (requires custom pipelines)

## Integration Patterns

### Pattern 1: Webhook-Driven Deployment
```
Git Push → GitHub Webhook → Doco-CD → Docker Compose Up
```

### Pattern 2: Polling-Based Deployment
```
Doco-CD (timer) → Git Fetch → Check Changes → Deploy
```

### Pattern 3: Multi-Environment Promotion
```
Dev Repo → Doco-CD Dev → Test → Doco-CD Prod
```

## Current Development Status

### Recent Releases (v0.76.0)
- Added manual poll trigger API endpoint (`POST /v1/api/poll/run`)
- Support for custom poll configurations via API

### Open Issues & PRs
- **#1164**: Swarm mode - only redeploy services when changed
- **#1158/#1157**: Add recreate ignore label to skip recreation
- **#1156**: Auto-discovery - deployments not removed when moved out of folder
- **#1147**: Docker registry-mirrors configuration support
- **#1130**: Option to indicate volume recreation
- **#1112**: Webhook bearer token support (aKeyless)
- **#1096**: Bitwarden Vault/Vaultwarden secret provider
- **#1093**: Polling from local filesystem Git repos

## Doco-CD vs Flux CD: Detailed Analysis

### Architecture Comparison

**Doco-CD:**
- Single Go binary (~20MB)
- Runs as container or standalone
- Direct Docker API integration
- Minimal dependencies

**Flux CD:**
- Kubernetes operators/controllers
- Requires K8s cluster to run
- Uses Kubernetes CRDs for configuration
- Higher resource overhead (K8s + controllers)

### Use Case Fit

**Doco-CD is better for:**
- Small teams without K8s expertise
- Edge/IoT deployments
- Simple self-hosted applications
- Rapid prototyping
- Resource-constrained environments

**Flux CD is better for:**
- Large-scale Kubernetes deployments
- Multi-cluster management
- Teams with K8s expertise
- Complex deployment patterns
- Enterprise environments

### Migration Path

If starting with Doco-CD and later need K8s:
1. Doco-CD deployments can be migrated to K8s manifests
2. Docker Compose can be converted to Kubernetes YAML
3. Or use Kompose tool for automated conversion

## Recommendations for Shadow

Based on the investigation, Doco-CD could be valuable for:

1. **Self-Hosted Instances**: Deploying Shadow on customer infrastructure
2. **Development Environments**: Quick setup for dev/staging
3. **Edge Deployments**: Lightweight deployment at edge locations
4. **Backup/DR**: Secondary deployment mechanism

### Why Doco-CD over Flux CD for Shadow

**Immediate Benefits:**
- No Kubernetes learning curve for users
- Lower infrastructure costs
- Faster deployment cycles
- Simpler debugging

**When to Consider Flux CD Instead:**
- If Shadow moves to Kubernetes-native architecture
- Enterprise customers requiring K8s
- Need advanced multi-tenancy features

### Considerations

**Pros:**
- Very low resource overhead
- Simple configuration
- No Kubernetes required
- Good for self-hosted scenarios
- Easier to understand and debug

**Cons:**
- No built-in UI for management
- Single point of failure (no HA)
- Limited to Docker Compose/Swarm
- Azure DevOps requires custom integration
- Less mature ecosystem than Flux/ArgoCD

## References

- [Doco-CD GitHub](https://github.com/kimdre/doco-cd)
- [Doco-CD Wiki](https://github.com/kimdre/doco-cd/wiki)
- [Quickstart Guide](https://github.com/kimdre/doco-cd/wiki/Quickstart)
- [App Settings](https://github.com/kimdre/doco-cd/wiki/App-Settings)
- [Setup Webhook](https://github.com/kimdre/doco-cd/wiki/Setup-Webhook)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitOps Principles](https://opengitops.dev/)
