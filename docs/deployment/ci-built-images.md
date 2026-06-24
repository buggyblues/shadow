# CI-built Docker images

Production hosts should not build the application images during deployment.
GitHub Actions builds and pushes these images after `post-merge-validation`
passes on `main`:

- `ghcr.io/buggyblues/shadow-server`
- `ghcr.io/buggyblues/shadow-web`
- `ghcr.io/buggyblues/shadow-admin`

Integration images use a separate publishing/deployment chain so an integration
image issue cannot block the main app rollout. The integrations chain publishes:

- `ghcr.io/buggyblues/shadow-integrations`
- `ghcr.io/buggyblues/shadow-integration-flash`
- `ghcr.io/buggyblues/shadow-integration-space`

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
4. Set the repository variable `GOOGLE_CLIENT_ID` when Chrome/FedCM or Google
   One Tap login should appear in the web app. The same client id must also be
   present in the production server `.env`, because the server validates the
   Google ID token `aud` field. In Google Cloud Console, add the production web
   origin, such as `https://shadowob.com`, to the OAuth client's authorized
   JavaScript origins.
5. Keep Website and Web App same-origin for the embedded login modal when
   possible. The production web image allows `/app/auth/modal` and
   `/app/auth/status` to be framed by `frame-ancestors 'self'`. If Website and
   Web App are split across different origins, update the web CSP
   `frame-ancestors` and the Website iframe `allow="identity-credentials-get"`
   policy together.

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
