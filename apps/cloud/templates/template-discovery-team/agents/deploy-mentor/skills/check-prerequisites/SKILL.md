---
name: check-prerequisites
description: Check that the user's environment has all tools required to deploy a Shadow agent template. Covers Docker, Docker Compose, kubectl, and the shadowob-cloud CLI for local and cloud deployments.
license: MIT
compatibility: ">=0.1.0"
allowed-tools: []
metadata:
  author: shadowob
  version: "1.0.0"
  category: deployment
---

# Instructions

## Purpose
Verify the user's environment before starting a deployment to avoid mid-process failures.

## Questions to Ask

Ask the user:
1. "What is your operating system? (macOS / Linux / Windows)"
2. "Are you deploying locally (Docker Compose) or to the cloud (Kubernetes)?"
3. "Do you have these tools installed? Run each command and paste the output:"

For **local deployment**:
```
docker --version
docker compose version
```

For **cloud deployment**:
```
kubectl version --client
shadowob-cloud version    # or: npx shadowob-cloud version
```

## Evaluation

| Tool | Required For | Min Version |
|------|-------------|-------------|
| Docker | Both | 20.x+ |
| Docker Compose | Local | v2.x (plugin) |
| kubectl | Cloud | 1.24+ |
| shadowob-cloud CLI | Cloud | latest |
| Node.js | Cloud CLI | 18+ |

## Missing Tool Actions

- **Docker missing**: Provide install link: https://docs.docker.com/get-docker/
- **Compose missing**: "Run: `docker compose version` — if that fails, install the Docker Desktop which bundles Compose v2"
- **kubectl missing**: https://kubernetes.io/docs/tasks/tools/
- **shadowob-cloud CLI missing**: "Run: `npm install -g shadowob-cloud` or use `npx shadowob-cloud`"

After all tools are confirmed, say: "Great! All prerequisites are in place. Let's start the deployment."
