# GitOps-Based Docker Compose CD Design

## Executive Summary

This document proposes a GitOps-based Continuous Deployment (CD) system for Docker Compose deployments, inspired by Doco-CD. The design enables automatic deployment of containerized applications through Git repository changes, supporting both webhook-driven and polling-based triggers.

## Goals

1. **GitOps-First**: All deployments triggered by Git changes
2. **Simple & Lightweight**: Minimal infrastructure overhead
3. **Secure**: Support for secrets management and encrypted configurations
4. **Observable**: Comprehensive logging, metrics, and notifications
5. **Flexible**: Support multiple deployment patterns and environments

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Git Repository │────▶│   CD Controller │────▶│  Docker Host    │
│  (Source of Truth)│     │  (Doco-CD-like)  │     │ (Compose/Swarm) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         │              ┌────────┴────────┐
         │              │                 │
         ▼              ▼                 ▼
┌─────────────────┐  ┌──────────┐   ┌──────────┐
│  Webhook Events │  │  Metrics │   │ Notifications│
└─────────────────┘  └──────────┘   └──────────┘
```

## Components

### 1. Git Repository Structure

```
repo/
├── .doco-cd.yaml          # Deployment configuration
├── docker-compose.yaml    # Compose definition
├── docker-compose.prod.yaml  # Production overrides
├── .env.example           # Environment template
└── scripts/
    └── pre-deploy.sh      # Optional pre-deployment hooks
```

### 2. Deployment Configuration Schema

```yaml
# .doco-cd.yaml
name: shadow-app                    # Deployment name
reference: refs/heads/main          # Git reference to track
working_dir: ./                     # Working directory

compose_files:                      # Compose file precedence
  - docker-compose.yaml
  - docker-compose.prod.yaml

env_files:                          # Environment files
  - .env

# Deployment behavior
remove_orphans: true                # Clean up orphaned containers
prune_images: true                  # Remove unused images
force_recreate: false               # Force container recreation
force_image_pull: true              # Always pull latest images
timeout: 300                        # Deployment timeout (seconds)

# Compose profiles
profiles:
  - production

# External secrets (from secret manager)
external_secrets:
  DATABASE_URL: "bitwarden:db-url-key"
  API_KEY: "vault:api-key-path"

# Auto-discovery for multi-service repos
auto_discover: false
auto_discover_opts:
  depth: 2
  delete: true

# Webhook filtering
webhook_filter: "^refs/heads/main$"  # Regex for ref filtering
```

### 3. CD Controller Configuration

Environment variables for the CD controller:

```yaml
# Server settings
HTTP_PORT: 8080
METRICS_PORT: 9090
LOG_LEVEL: info

# Security
API_SECRET: "${API_SECRET}"           # API authentication
WEBHOOK_SECRET: "${WEBHOOK_SECRET}"   # Webhook validation

# Git authentication
GIT_ACCESS_TOKEN: "${GITHUB_TOKEN}"   # For HTTPS repos
SSH_PRIVATE_KEY: "${SSH_KEY}"         # For SSH repos
AUTH_TYPE: oauth2                     # oauth2, ssh, token

# Deployment settings
DEPLOY_CONFIG_BASE_DIR: /
MAX_CONCURRENT_DEPLOYMENTS: 4
DOCKER_SWARM_FEATURES: true
DOCKER_QUIET_DEPLOY: false

# Polling configuration
POLL_CONFIG: |
  - name: shadow-app
    url: https://github.com/org/shadow
    ref: refs/heads/main
    interval: 5m
  - name: shadow-staging
    url: https://github.com/org/shadow
    ref: refs/heads/staging
    interval: 2m

# Notifications
APPRISE_API_URL: http://apprise:8000
APPRISE_NOTIFY_URLS: "discord://webhook,slack://token"
APPRISE_NOTIFY_LEVEL: success

# Secret provider
SECRET_PROVIDER: bitwarden            # bitwarden, vault, aws-sm
```

## Deployment Flow

### Webhook-Driven Deployment

```
1. Developer pushes code to Git
        │
        ▼
2. Git provider sends webhook
   POST /webhook/github
   Headers: X-Hub-Signature-256
        │
        ▼
3. CD Controller validates webhook
        │
        ▼
4. Clone/Fetch repository
        │
        ▼
5. Parse .doco-cd.yaml
        │
        ▼
6. Resolve external secrets
        │
        ▼
7. Execute docker compose up
        │
        ▼
8. Send notifications
        │
        ▼
9. Update metrics
```

### Polling-Based Deployment

```
1. Timer triggers (interval: 5m)
        │
        ▼
2. Fetch remote refs
        │
        ▼
3. Compare with local state
        │
        ▼
4. If changed, trigger deployment
        │
        ▼
5. Execute deployment flow (steps 4-9)
```

## Security Design

### 1. Webhook Security

```go
// HMAC-SHA256 signature validation
func validateWebhook(payload []byte, signature string, secret string) error {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(payload)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))

    if !hmac.Equal([]byte(expected), []byte(signature)) {
        return ErrInvalidSignature
    }
    return nil
}
```

### 2. Secret Management

**Option A: External Secret Provider**
```yaml
external_secrets:
  DATABASE_URL: "bitwarden:item-id/field"
```

**Option B: SOPS Encryption**
```bash
# Encrypt .env file
sops --encrypt --in-place .env

# CD controller decrypts at deployment
sops --decrypt .env > .env.decrypted
```

### 3. Network Security

- Run CD controller in isolated network
- Use TLS for all Git operations
- Restrict webhook endpoints to Git provider IPs

## Multi-Environment Strategy

### Repository-Based Environments

```
┌─────────────────┐
│  shadow (main)  │
└────────┬────────┘
         │
    ┌────┼────┐
    │    │    │
    ▼    ▼    ▼
┌──────┐┌──────┐┌──────┐
│  dev ││stage ││ prod │
└──────┘└──────┘└──────┘
```

### Configuration per Environment

```yaml
# .doco-cd.dev.yaml
name: shadow-dev
reference: refs/heads/develop
profiles: [dev]
force_image_pull: false

# .doco-cd.prod.yaml
name: shadow-prod
reference: refs/heads/main
profiles: [production]
force_image_pull: true
webhook_filter: "^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$"
```

## Implementation Phases

### Phase 1: Core Deployment (MVP)

- [ ] Webhook endpoint for GitHub/GitLab
- [ ] Basic Docker Compose deployment
- [ ] Configuration file parsing
- [ ] Simple logging

### Phase 2: Enhanced Reliability

- [ ] Polling mechanism
- [ ] Concurrent deployment limits
- [ ] Health checks
- [ ] Rollback on failure

### Phase 3: Security & Observability

- [ ] Secret management integration
- [ ] SOPS encryption support
- [ ] Prometheus metrics
- [ ] Multi-channel notifications

### Phase 4: Advanced Features

- [ ] Docker Swarm support
- [ ] Auto-discovery
- [ ] Pre/post deployment hooks
- [ ] Multi-node deployment

## Docker Compose Setup

### CD Controller Service

```yaml
version: "3.8"

services:
  doco-cd:
    image: ghcr.io/kimdre/doco-cd:latest
    container_name: doco-cd
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "9090:9090"
    environment:
      - HTTP_PORT=8080
      - METRICS_PORT=9090
      - LOG_LEVEL=info
      - API_SECRET=${API_SECRET}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
      - GIT_ACCESS_TOKEN=${GITHUB_TOKEN}
      - DOCKER_SWARM_FEATURES=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./configs:/configs
    networks:
      - cd-network

  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    restart: unless-stopped
    environment:
      - APPRISE_STATEFUL_MODE=simple
    volumes:
      - ./apprise-config:/config
    networks:
      - cd-network

networks:
  cd-network:
    driver: bridge
```

## API Endpoints

### Webhook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/github` | POST | GitHub webhook receiver |
| `/webhook/gitlab` | POST | GitLab webhook receiver |
| `/webhook/gitea` | POST | Gitea webhook receiver |
| `/webhook/generic` | POST | Generic webhook receiver |

### Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/deploy` | POST | Manual deployment trigger |
| `/status` | GET | Deployment status |

### Example Webhook Payload

```json
{
  "ref": "refs/heads/main",
  "repository": {
    "clone_url": "https://github.com/org/repo.git",
    "name": "repo"
  },
  "head_commit": {
    "id": "abc123",
    "message": "Update configuration",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Monitoring & Alerting

### Prometheus Metrics

```
# Deployment metrics
doco_cd_deployments_total{status="success|failure"}
doco_cd_deployment_duration_seconds

# Git metrics
doco_cd_git_operations_total{operation="clone|fetch|checkout"}
doco_cd_git_operation_duration_seconds

# System metrics
doco_cd_active_deployments
doco_cd_queue_size
```

### Alert Rules

```yaml
groups:
  - name: doco-cd
    rules:
      - alert: DeploymentFailure
        expr: doco_cd_deployments_total{status="failure"} > 0
        for: 1m
        annotations:
          summary: "Deployment failed"
          
      - alert: HighDeploymentDuration
        expr: doco_cd_deployment_duration_seconds > 300
        for: 5m
        annotations:
          summary: "Deployment taking too long"
```

## Best Practices

### 1. Repository Organization

```
repo/
├── docker-compose.yaml          # Base configuration
├── docker-compose.override.yaml # Local overrides (gitignored)
├── docker-compose.prod.yaml     # Production overrides
├── .doco-cd.yaml               # CD configuration
├── .env.example                # Example environment
├── .env                        # Actual environment (gitignored, encrypted)
└── .sops.yaml                  # SOPS configuration
```

### 2. Secret Management

```yaml
# .sops.yaml
creation_rules:
  - path_regex: \.env$
    kms: arn:aws:kms:us-east-1:123456789:key/12345678
```

```bash
# Encrypt secrets
sops --encrypt --in-place .env

# Decrypt for local use
sops --decrypt .env > .env.decrypted
```

### 3. Environment Promotion

```yaml
# .doco-cd.yaml (multi-document)
---
# Development
name: shadow-dev
reference: refs/heads/develop
profiles: [dev]
webhook_filter: "^refs/heads/develop$"

---
# Staging
name: shadow-staging
reference: refs/heads/main
profiles: [staging]
webhook_filter: "^refs/heads/main$"

---
# Production
name: shadow-prod
reference: refs/tags/v*
profiles: [production]
webhook_filter: "^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$"
```

## Shadow Integration Considerations

### Use Cases

1. **Self-Hosted Deployments**
   - Customers deploy Shadow on their infrastructure
   - Automatic updates via GitOps
   - Minimal operational overhead

2. **Development Environments**
   - Quick setup for developers
   - Automatic sync with feature branches
   - Isolated environments per branch

3. **Edge Deployments**
   - Lightweight deployment at edge locations
   - Polling-based updates for restricted networks
   - Offline-capable with local Git mirrors

### Integration Points

```yaml
# Example Shadow deployment configuration
name: shadow-instance
reference: refs/heads/main
working_dir: ./

compose_files:
  - docker-compose.yaml
  - docker-compose.${SHADOW_ENV}.yaml

env_files:
  - .env

external_secrets:
  DATABASE_URL: "${SECRET_PROVIDER}:shadow-db-url"
  REDIS_URL: "${SECRET_PROVIDER}:shadow-redis-url"
  JWT_SECRET: "${SECRET_PROVIDER}:shadow-jwt-secret"

profiles:
  - ${SHADOW_ENV}
```

## Conclusion

This GitOps-based CD design provides a lightweight, secure, and observable solution for Docker Compose deployments. By leveraging Doco-CD patterns, we can achieve:

- **Simplicity**: Minimal configuration and infrastructure
- **Reliability**: Git as the single source of truth
- **Security**: Built-in secret management and encryption
- **Observability**: Comprehensive metrics and notifications
- **Flexibility**: Support for multiple deployment patterns

## References

- [Doco-CD GitHub](https://github.com/kimdre/doco-cd)
- [GitOps Working Group](https://opengitops.dev/)
- [Docker Compose Specification](https://compose-spec.io/)
- [SOPS - Secrets OPerationS](https://github.com/getsops/sops)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
