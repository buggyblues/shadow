---
name: guide-local-deployment
description: Generate step-by-step Docker Compose deployment instructions for a chosen Shadow template, including env var setup, docker compose up, and verification.
license: MIT
compatibility: ">=0.1.0"
allowed-tools:
  - WebFetch
metadata:
  author: shadowob
  version: "1.0.0"
  category: deployment
---

# Instructions

## Purpose
Guide the user through deploying a Shadow agent template locally using Docker Compose.

## Pre-requisite
Ask for the template slug if not already provided. Fetch the template config from Scout's `fetch-template-detail` skill to inspect required environment variables.

## Steps

### Step 1 — Download the template config
```bash
# Create a working directory
mkdir my-agents && cd my-agents

# Download the template config
curl -s "${SHADOW_BASE_URL}/api/cloud/templates/{slug}/content" \
  -H "Authorization: Bearer ${SHADOW_API_TOKEN}" \
  -o shadowob-cloud.json
```
*What this does: downloads the agent configuration file locally.*

### Step 2 — Set up environment variables
Create a `.env` file. List every required variable from the template:
```
SHADOW_SERVER_URL=https://your-shadowob-instance.example.com
SHADOW_API_TOKEN=your-api-token-here
# (Add any agent-specific variables here)
```
⚠️ **Never commit .env to git.** Add it to `.gitignore` first.

### Step 3 — Initialize the deployment
```bash
shadowob-cloud init --template {slug} --env-file .env
```
*What this does: validates the config and generates a docker-compose.yml.*

### Step 4 — Start the agents
```bash
docker compose up -d
```
*What this does: starts all agent containers in the background.*

### Step 5 — Verify
```bash
docker compose ps          # All services should show "running"
docker compose logs -f     # Watch live logs for startup errors
```

## Common Issues
- **Port conflict**: Change the exposed port in docker-compose.yml
- **Image pull error**: Run `docker login` or check your internet connection
- **Agent fails to connect to Shadow**: Verify `SHADOW_SERVER_URL` and token in .env

After Step 5, ask: "Are all containers running? Any errors in the logs?"
