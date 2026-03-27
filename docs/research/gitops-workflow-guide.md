# GitOps Workflow with Doco-CD

## What is GitOps?

GitOps is a methodology where Git repositories serve as the **single source of truth** for infrastructure and application configurations. Changes to the system are made by updating Git, and automated tools sync the live state to match.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Git Repo  │────▶│   Doco-CD   │────▶│   Docker    │
│  (Desired   │     │  (Reconcile)│     │  (Actual    │
│   State)    │◄────│             │◄────│   State)    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Core Principles

1. **Declarative Configuration**: Everything defined in code
2. **Version Control**: All changes tracked in Git
3. **Automated Sync**: Automatic deployment on Git changes
4. **Drift Detection**: System self-heals to match Git state

## GitOps Workflow with Doco-CD

### 1. Repository Structure

```
shadow-deployment/
├── .doco-cd.yaml              # Doco-CD deployment config
├── docker-compose.yaml        # Main application stack
├── docker-compose.prod.yaml   # Production overrides
├── docker-compose.dev.yaml    # Development overrides
├── .env.example               # Environment template
├── .env                       # Actual secrets (encrypted/gitignored)
├── configs/
│   ├── nginx.conf
│   └── app-config.yaml
├── scripts/
│   └── init-db.sh
└── README.md
```

### 2. Configuration as Code

#### Main Deployment Config (`.doco-cd.yaml`)

```yaml
# Multi-environment deployment
---
# Development
name: shadow-dev
reference: refs/heads/develop
working_dir: ./
compose_files:
  - docker-compose.yaml
  - docker-compose.dev.yaml
env_files:
  - .env
profiles:
  - dev
webhook_filter: "^refs/heads/develop$"
remove_orphans: true
prune_images: false

---
# Production
name: shadow-prod
reference: refs/heads/main
working_dir: ./
compose_files:
  - docker-compose.yaml
  - docker-compose.prod.yaml
env_files:
  - .env
profiles:
  - production
webhook_filter: "^refs/heads/main$"
remove_orphans: true
prune_images: true
force_image_pull: true
timeout: 300
```

#### Docker Compose Stack

```yaml
# docker-compose.yaml
version: "3.8"

services:
  app:
    image: ghcr.io/shadow/app:${VERSION:-latest}
    container_name: shadow-app
    restart: unless-stopped
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - "3000:3000"
    volumes:
      - app-data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    labels:
      - "doco-cd.managed=true"
      - "doco-cd.environment=${ENVIRONMENT}"

  db:
    image: postgres:15-alpine
    container_name: shadow-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: shadow-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  app-data:
  db-data:
  redis-data:
```

### 3. Environment Promotion Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Develop   │───▶│    Main     │───▶│     Tag     │
│   Branch    │    │   Branch    │    │   (v1.0.0)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Dev Env    │    │  Staging    │    │  Production │
│  (auto)     │    │  (auto)     │    │  (manual)   │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Workflow:**
1. Developer pushes to `develop` → Auto deploy to Dev
2. PR merged to `main` → Auto deploy to Staging
3. Tag created `v1.0.0` → Manual approval → Deploy to Production

### 4. Change Management Process

#### Making Changes (GitOps Way)

```bash
# 1. Create feature branch
git checkout -b feature/new-api-endpoint

# 2. Update configuration
vim docker-compose.yaml  # Add new service
vim .doco-cd.yaml        # Update deployment config

# 3. Commit changes
git add .
git commit -m "feat: add analytics service

- Add Redis for caching
- Update health checks
- Configure auto-scaling"

# 4. Push and create PR
git push origin feature/new-api-endpoint
gh pr create --title "feat: add analytics service"

# 5. Review and merge
# After PR review, merge to develop
```

#### Automated Deployment

```
Developer Push ──▶ GitHub ──▶ Webhook ──▶ Doco-CD ──▶ Deploy
```

### 5. Secret Management

#### Option A: SOPS (Recommended)

```bash
# 1. Install SOPS
brew install sops  # macOS
# or
wget https://github.com/getsops/sops/releases/download/v3.8.1/sops-v3.8.1.linux.amd64

# 2. Create encryption config (.sops.yaml)
cat > .sops.yaml << 'EOF'
creation_rules:
  - path_regex: \.env$
    kms: arn:aws:kms:us-east-1:123456789:key/your-key-id
EOF

# 3. Create and encrypt secrets
cat > .env << 'EOF'
DATABASE_URL=postgres://user:pass@db:5432/shadow
API_KEY=sk-live-xxxxxxxxxxxx
JWT_SECRET=super-secret-jwt-key
EOF

sops --encrypt --in-place .env

# 4. Commit encrypted file
git add .env
git commit -m "chore: update encrypted secrets"
```

#### Option B: External Secret Provider

```yaml
# .doco-cd.yaml
name: shadow-prod
external_secrets:
  DATABASE_URL: "bitwarden:shadow-prod-db-url"
  API_KEY: "bitwarden:shadow-prod-api-key"
  JWT_SECRET: "bitwarden:shadow-prod-jwt"
```

#### Option C: Docker Secrets (Swarm)

```yaml
# docker-compose.yaml
services:
  app:
    image: shadow/app:latest
    secrets:
      - db_password
      - api_key
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    external: true
  api_key:
    external: true
```

### 6. Drift Detection & Self-Healing

Doco-CD automatically reconciles drift:

```
Manual Change ──▶ Docker ──▶ Doco-CD detects ──▶ Reverts to Git state
```

**Example:**
```bash
# Someone manually changes container
docker stop shadow-app
docker run -d --name shadow-app-temp shadow/app:old-version

# Doco-CD detects on next sync
# Reverts to: shadow/app:latest (as defined in docker-compose.yaml)
```

### 7. Rollback Strategy

#### Automatic Rollback on Failure

```yaml
# .doco-cd.yaml
name: shadow-prod
reference: refs/heads/main
# Doco-CD doesn't auto-rollback, but you can:
# 1. Use health checks
# 2. Monitor deployment status
# 3. Manual rollback via Git
```

#### Manual Rollback

```bash
# Rollback to previous version
git revert HEAD
git push origin main

# Or checkout specific tag
git checkout v1.2.3
git checkout -b hotfix/rollback
git push origin hotfix/rollback

# Create PR to main
gh pr create --title "hotfix: rollback to v1.2.3"
```

### 8. Multi-Environment Setup

```yaml
# .doco-cd.yaml (all environments)
---
# Development - every push to develop
deployments:
  - name: shadow-dev
    reference: refs/heads/develop
    working_dir: ./
    profiles: [dev]
    webhook_filter: "^refs/heads/develop$"

---
# Staging - every push to main
  - name: shadow-staging
    reference: refs/heads/main
    working_dir: ./
    profiles: [staging]
    webhook_filter: "^refs/heads/main$"

---
# Production - only tags
  - name: shadow-prod
    reference: refs/tags/v*
    working_dir: ./
    profiles: [production]
    webhook_filter: "^refs/tags/v[0-9]+\\.[0-9]+\\.[0-9]+$"
    force_image_pull: true
```

### 9. CI/CD Integration

#### GitHub Actions + Doco-CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, develop]
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t shadow/app:${{ github.sha }} .
      - name: Push image
        run: |
          echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker push shadow/app:${{ github.sha }}

  trigger-deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Doco-CD webhook
        run: |
          curl -X POST "${{ secrets.DOCOCD_WEBHOOK_URL }}" \
            -H "Content-Type: application/json" \
            -H "X-Hub-Signature-256: sha256=${{ secrets.DOCOCD_WEBHOOK_SECRET }}" \
            -d '{"ref":"${{ github.ref }}","repository":{"clone_url":"${{ github.repository }}"}}'
```

### 10. Best Practices

#### Git Repository Organization

```
shadow-platform/
├── apps/
│   ├── web/                    # Frontend application
│   │   ├── docker-compose.yaml
│   │   └── .doco-cd.yaml
│   ├── api/                    # Backend API
│   │   ├── docker-compose.yaml
│   │   └── .doco-cd.yaml
│   └── worker/                 # Background workers
│       ├── docker-compose.yaml
│       └── .doco-cd.yaml
├── infra/                      # Shared infrastructure
│   ├── docker-compose.yaml     # DB, Redis, etc.
│   └── .doco-cd.yaml
├── environments/
│   ├── dev/                    # Dev-specific configs
│   ├── staging/                # Staging configs
│   └── prod/                   # Production configs
└── scripts/
    └── migrate.sh
```

#### Commit Message Convention

```
feat: add user authentication service
  └── triggers deployment

fix: resolve database connection timeout
  └── triggers deployment

chore: update README
  └── no deployment (no config change)

BREAKING CHANGE: update API v2 schema
  └── triggers deployment with migration
```

#### Branch Protection

```
main branch:
  ✓ Require PR reviews (2)
  ✓ Require status checks (tests pass)
  ✓ Require up-to-date branch
  ✓ Include administrators

develop branch:
  ✓ Require PR reviews (1)
  ✓ Require status checks
```

### 11. Monitoring GitOps

#### Deployment Metrics

```promql
# Deployment frequency
rate(doco_cd_deployments_total[1h])

# Deployment duration
doco_cd_deployment_duration_seconds

# Failed deployments
doco_cd_deployments_total{status="failure"}

# Active deployments
doco_cd_active_deployments
```

#### GitOps Dashboard

```yaml
# Grafana dashboard
- Panel: Deployment Frequency (per hour/day/week)
- Panel: Lead Time (commit to deploy)
- Panel: Change Failure Rate
- Panel: MTTR (Mean Time To Recovery)
```

### 12. Troubleshooting GitOps

#### Common Issues

**Issue: Deployment not triggered**
```bash
# Check webhook delivery
# GitHub → Settings → Webhooks → Recent Deliveries

# Check Doco-CD logs
docker compose logs -f doco-cd

# Verify webhook secret matches
```

**Issue: Config drift**
```bash
# Force re-sync
curl -X POST "https://cd.example.com/v1/api/deploy" \
  -H "X-API-Key: ${API_SECRET}" \
  -d '{"name":"shadow-prod"}'
```

**Issue: Wrong environment deployed**
```bash
# Check webhook_filter regex
# Verify branch/tag matches
# Check reference in .doco-cd.yaml
```

### 13. Advanced Patterns

#### Pattern: Feature Branch Deployments

```yaml
# .doco-cd.yaml
name: shadow-feature-${BRANCH_NAME}
reference: refs/heads/feature/*
working_dir: ./
webhook_filter: "^refs/heads/feature/"
auto_discover: true
```

#### Pattern: Blue-Green Deployment

```yaml
# docker-compose.blue.yaml
services:
  app:
    labels:
      - "traefik.frontend.rule=Host:blue.example.com"

# docker-compose.green.yaml
services:
  app:
    labels:
      - "traefik.frontend.rule=Host:green.example.com"
```

#### Pattern: Canary Deployment

```yaml
# docker-compose.yaml
services:
  app-stable:
    image: shadow/app:stable
    deploy:
      replicas: 9
  
  app-canary:
    image: shadow/app:${NEW_VERSION}
    deploy:
      replicas: 1
```

## Summary

GitOps with Doco-CD provides:

✅ **Single Source of Truth** - Git is the canonical state
✅ **Full Audit Trail** - Every change tracked in Git
✅ **Easy Rollbacks** - Revert via Git
✅ **Drift Detection** - Auto-healing to desired state
✅ **Multi-Environment** - Same process for dev/staging/prod
✅ **Developer Friendly** - Use familiar Git workflows

## References

- [GitOps Principles](https://opengitops.dev/)
- [Doco-CD Wiki](https://github.com/kimdre/doco-cd/wiki)
- [Docker Compose](https://docs.docker.com/compose/)
- [SOPS Documentation](https://getsops.io/)