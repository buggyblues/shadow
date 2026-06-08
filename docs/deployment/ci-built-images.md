# CI-built Docker images

Production hosts should not build the application images during deployment.
GitHub Actions builds and pushes these images after `post-merge-validation`
passes on `main`:

- `ghcr.io/buggyblues/shadow-server`
- `ghcr.io/buggyblues/shadow-web`
- `ghcr.io/buggyblues/shadow-admin`

Integration images are not part of the production host deploy chain. Keep them
on a separate publishing/deployment path so an integration image issue cannot
block the main app rollout.

The workflow publishes three useful tag styles:

- `latest` for the newest verified `main` build
- `main` for the newest verified `main` build
- `sha-<12-char-sha>` for immutable deploys and rollback

## GitHub setup

1. Ensure GitHub Actions can write packages for the repository.
2. If the GHCR packages are private, log in once on the server:

```bash
docker login ghcr.io
```

3. Optional: set the repository variable `PROD_WEB_API_BASE` if the web app
   should call an API origin that differs from the web origin. Do not include
   `/api`; use a value like `https://shadowob.com`. Leave it empty when the
   web container proxies same-origin `/api` to the server container.

## Server deploy

The production deploy host only runs the main app stack: `server`, `web`, and
`admin`. Keep secrets in the server-side `.env` file. Choose the image tag
there:

```dotenv
SHADOW_IMAGE_REGISTRY=ghcr.io
SHADOW_IMAGE_NAMESPACE=buggyblues
SHADOW_IMAGE_TAG=sha-0123456789ab
```

Then deploy without building on the server:

```bash
docker compose -f docker-compose.prod.yml pull server web admin
docker compose -f docker-compose.prod.yml up -d --remove-orphans --no-build
docker image prune -f
```

Rollback is just changing `SHADOW_IMAGE_TAG` back to the previous
`sha-<12-char-sha>` tag and running the same commands again.

See [production-cd.zh-CN.md](production-cd.zh-CN.md) for the automated deploy
workflow, manual deploy inputs, and data migration runbook.
