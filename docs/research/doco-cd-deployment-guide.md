# Doco-CD Deployment Preparation Guide

## Prerequisites Checklist

### 1. Infrastructure Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 1 core | 2 cores |
| **RAM** | 512 MB | 1 GB |
| **Disk** | 10 GB | 50 GB+ (for images) |
| **OS** | Linux with Docker | Ubuntu 22.04 LTS |
| **Network** | Outbound HTTPS | Public IP (for webhooks) |

### 2. Docker Environment

```bash
# Check Docker installation
docker --version
docker compose version

# Verify Docker daemon is running
docker info

# Check if Swarm mode is needed
docker info --format '{{.Swarm.LocalNodeState}}'
```

**Required Access:**
- Docker socket access (`/var/run/docker.sock`)
- Privileged mode NOT required
- Container can run as non-root (with proper socket permissions)

### 3. Network Requirements

#### For Webhook Mode (Recommended)
- **Public IP or Domain**: Git providers must reach your Doco-CD instance
- **Port**: 80/443 (configurable via `HTTP_PORT`)
- **TLS**: Recommended (use reverse proxy like Nginx/Traefik/Caddy)
- **Firewall**: Allow inbound from Git provider IPs

#### For Polling Mode
- **Outbound HTTPS only**: No public IP required
- **Port**: Internal only (no external exposure needed)
- **Can run behind NAT/firewall**

### 4. Git Provider Setup

#### GitHub
1. Generate Personal Access Token:
   - Go to Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Select scopes: `repo` (for private repos)

2. Generate Webhook Secret:
   ```bash
   openssl rand -base64 32
   ```

3. Configure Webhook:
   - Repository → Settings → Webhooks → Add webhook
   - Payload URL: `https://your-domain/v1/webhook`
   - Content type: `application/json`
   - Secret: (from step 2)
   - Events: Push events

#### GitLab
1. Generate Personal Access Token:
   - User Settings → Access Tokens
   - Scopes: `read_repository`, `read_user`

2. Configure Webhook:
   - Project → Settings → Webhooks
   - URL: `https://your-domain/v1/webhook`
   - Secret Token: (generated secret)
   - Trigger: Push events, Tag push events

#### Gitea/Forgejo
1. Generate Access Token:
   - User Settings → Applications → Generate Token

2. Configure Webhook:
   - Repository Settings → Webhooks → Add webhook → Gitea
   - Target URL: `https://your-domain/v1/webhook`
   - HTTP Method: POST
   - Secret: (generated secret)

## Deployment Modes

### Mode 1: Webhook-Driven (Recommended)

**Architecture:**
```
Git Push → GitHub Webhook → Doco-CD → Docker Compose Up
```

**When to use:**
- Public IP/domain available
- Need immediate deployments
- Production environments

**Configuration:**
```yaml
# docker-compose.yml
services:
  doco-cd:
    image: ghcr.io/kimdre/doco-cd:latest
    container_name: doco-cd
    restart: unless-stopped
    ports:
      - "80:80"  # Webhook endpoint
      - "9120:9120"  # Metrics
    environment:
      TZ: Asia/Shanghai
      GIT_ACCESS_TOKEN: ${GIT_ACCESS_TOKEN}
      WEBHOOK_SECRET: ${WEBHOOK_SECRET}
      LOG_LEVEL: info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - data:/data
    healthcheck:
      test: ["CMD", "/doco-cd", "healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  data:
```

**Required Environment Variables:**
- `GIT_ACCESS_TOKEN`: For cloning private repositories
- `WEBHOOK_SECRET`: For webhook authentication

### Mode 2: Polling-Based

**Architecture:**
```
Doco-CD (timer) → Git Fetch → Check Changes → Deploy
```

**When to use:**
- No public IP available
- Behind NAT/firewall
- Development environments
- Edge deployments

**Configuration:**
```yaml
# docker-compose.yml
services:
  doco-cd:
    image: ghcr.io/kimdre/doco-cd:latest
    container_name: doco-cd
    restart: unless-stopped
    # No ports exposed - internal only
    environment:
      TZ: Asia/Shanghai
      GIT_ACCESS_TOKEN: ${GIT_ACCESS_TOKEN}
      POLL_CONFIG: |
        - url: https://github.com/your-org/your-repo.git
          reference: main
          interval: 300  # 5 minutes
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - data:/data

volumes:
  data:
```

**Required Environment Variables:**
- `GIT_ACCESS_TOKEN`: For cloning repositories
- `POLL_CONFIG`: Polling configuration

### Mode 3: Hybrid (Webhook + Polling)

**When to use:**
- Primary: Webhook for immediate deployments
- Backup: Polling for reliability
- Multi-repo with different requirements

**Configuration:**
```yaml
# docker-compose.yml
x-poll-config: &poll-config
  POLL_CONFIG: |
    - url: https://github.com/org/repo1.git
      reference: main
      interval: 300
    - url: https://github.com/org/repo2.git
      reference: develop
      interval: 60

services:
  doco-cd:
    image: ghcr.io/kimdre/doco-cd:latest
    container_name: doco-cd
    restart: unless-stopped
    ports:
      - "80:80"
      - "9120:9120"
    environment:
      TZ: Asia/Shanghai
      GIT_ACCESS_TOKEN: ${GIT_ACCESS_TOKEN}
      WEBHOOK_SECRET: ${WEBHOOK_SECRET}
      <<: *poll-config
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - data:/data

volumes:
  data:
```

## Repository Configuration

### 1. Create `.doco-cd.yaml`

```yaml
# Basic configuration
name: my-application
reference: refs/heads/main
working_dir: ./
compose_files:
  - docker-compose.yaml
env_files:
  - .env
remove_orphans: true
prune_images: true
```

### 2. Multi-Environment Setup

```yaml
# .doco-cd.yaml (multi-document)
---
# Development
name: my-app-dev
reference: refs/heads/develop
profiles:
  - dev
webhook_filter: "^refs/heads/develop$"

---
# Production
name: my-app-prod
reference: refs/heads/main
profiles:
  - production
webhook_filter: "^refs/heads/main$"
force_image_pull: true
```

### 3. External Repository Deployment

```yaml
# Deploy from different repository
name: shared-services
repository_url: https://github.com/org/shared-configs.git
reference: main
working_dir: services/
compose_files:
  - docker-compose.yaml
env_files:
  - .env
  - remote:production.env  # From remote repo
```

## Security Checklist

### 1. Secrets Management

**Option A: Environment Variables (Basic)**
```bash
# .env file (do not commit)
GIT_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
WEBHOOK_SECRET=your-secret-here
```

**Option B: Docker Secrets (Swarm)**
```bash
# Create secrets
echo "ghp_xxxxxxxxxxxx" | docker secret create git_token -
echo "your-secret" | docker secret create webhook_secret -

# Use in compose
services:
  doco-cd:
    secrets:
      - git_token
      - webhook_secret
    environment:
      GIT_ACCESS_TOKEN_FILE: /run/secrets/git_token
      WEBHOOK_SECRET_FILE: /run/secrets/webhook_secret
```

**Option C: External Secret Provider**
```yaml
# .doco-cd.yaml
name: my-app
external_secrets:
  DATABASE_URL: "bitwarden:db-url-key"
  API_KEY: "vault:api-key-path"
```

### 2. SOPS Encryption

```bash
# Install SOPS
wget https://github.com/getsops/sops/releases/download/v3.8.1/sops-v3.8.1.linux.amd64 -O sops
chmod +x sops

# Create .sops.yaml
cat > .sops.yaml << 'EOF'
creation_rules:
  - path_regex: \.env$
    kms: arn:aws:kms:us-east-1:123456789:key/12345678
EOF

# Encrypt .env
sops --encrypt --in-place .env
```

### 3. Network Security

**Reverse Proxy with TLS (Nginx)**
```nginx
# /etc/nginx/sites-available/doco-cd
server {
    listen 443 ssl http2;
    server_name cd.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy (Simpler)**
```caddyfile
# Caddyfile
cd.example.com {
    reverse_proxy localhost:80
}
```

## Monitoring Setup

### 1. Prometheus Metrics

Doco-CD exposes metrics at `http://localhost:9120/metrics`

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'doco-cd'
    static_configs:
      - targets: ['doco-cd:9120']
    scrape_interval: 30s
```

### 2. Notifications (Apprise)

```yaml
# docker-compose.yml
services:
  doco-cd:
    environment:
      APPRISE_API_URL: http://apprise:8000
      APPRISE_NOTIFY_URLS: "discord://webhook-id/token,slack://token"
      APPRISE_NOTIFY_LEVEL: success  # success, error, or always
  
  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    restart: unless-stopped
    environment:
      APPRISE_STATEFUL_MODE: simple
    volumes:
      - ./apprise-config:/config
```

### 3. Health Checks

```bash
# Check health
curl http://localhost:80/v1/health

# Check metrics
curl http://localhost:9120/metrics

# View logs
docker compose logs -f doco-cd
```

## Troubleshooting

### Common Issues

**1. Webhook not triggering**
- Check `WEBHOOK_SECRET` matches Git provider
- Verify webhook URL is accessible from internet
- Check logs: `docker compose logs -f`

**2. Permission denied on Docker socket**
```bash
# Fix socket permissions
sudo chmod 666 /var/run/docker.sock
# Or run container with proper group
```

**3. Git authentication failed**
- Verify `GIT_ACCESS_TOKEN` is valid
- Check token has `repo` scope (GitHub)
- For SSH: verify key format (OpenSSH, not PEM)

**4. Deployment timeout**
- Increase `timeout` in `.doco-cd.yaml`
- Check network connectivity to registry
- Verify image pull credentials

## Production Checklist

- [ ] Use specific version tag (not `latest`)
- [ ] Enable TLS/HTTPS
- [ ] Configure secrets management
- [ ] Set up monitoring and alerts
- [ ] Enable log rotation
- [ ] Configure backup for `/data` volume
- [ ] Set resource limits
- [ ] Test rollback procedure
- [ ] Document runbooks

## Quick Start Commands

```bash
# 1. Clone and prepare
git clone https://github.com/your-org/doco-cd-config.git
cd doco-cd-config

# 2. Create secrets
cp .env.example .env
# Edit .env with your tokens

# 3. Start Doco-CD
docker compose up -d

# 4. Verify
docker compose ps
docker compose logs -f

# 5. Test webhook (GitHub example)
curl -X POST http://localhost:80/v1/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main","repository":{"clone_url":"https://github.com/your/repo.git"}}'
```

## References

- [Doco-CD Quickstart](https://github.com/kimdre/doco-cd/wiki/Quickstart)
- [App Settings](https://github.com/kimdre/doco-cd/wiki/App-Settings)
- [Deploy Settings](https://github.com/kimdre/doco-cd/wiki/Deploy-Settings)
- [Setup Webhook](https://github.com/kimdre/doco-cd/wiki/Setup-Webhook)
- [Poll Settings](https://github.com/kimdre/doco-cd/wiki/Poll-Settings)