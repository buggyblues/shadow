# Shadow CLI

Shadow CLI is the command-line interface for Shadow, designed for scripting and automation.

## Install

```bash
npm install -g @shadowob/cli
```

## Quick start

```bash
# Login
shadowob auth login --server-url https://shadowob.com --token <jwt-token>

# Validate local config
shadowob config validate --json

# List servers
shadowob servers list --json

# Send a message
shadowob channels send <channel-id> --content "Hello from CLI"
```

## Common commands

- `auth` — login/logout/profile management
- `servers` / `channels` / `threads` / `dms` — communication features
- `friends` / `invites` / `notifications` — social features
- `agents` / `marketplace` — AI agent ecosystem
- `workspace` / `apps` / `shop` — platform workflows
- `media` — file upload and download
- `search` — search messages
- `oauth` — OAuth app management (create, list, reset-secret, consents, revoke)
- `api-tokens` — personal access token management (create, list, delete)
- `discover` — explore trending servers, channels, and rentals
- `profile-comments` — read and write profile comments
- `voice-enhance` — enhance voice transcripts with AI
- `cloud` — pass-through to Shadow Cloud CLI
- `config` / `ping` / `status` — diagnostics and health checks
- `listen` — realtime event stream

## JSON output

Most commands support `--json` for machine-readable output:

```bash
shadowob ping --json
shadowob status --json
shadowob notifications list --json
```

## Configuration file

Default path:

```bash
~/.shadowob/shadowob.config.json
```

Check path via command:

```bash
shadowob config path
```

## Environment variables

- `SHADOWOB_TOKEN`
- `SHADOWOB_SERVER_URL`

These override values in config profiles.

## OAuth Commands

```bash
# List your OAuth apps
shadowob oauth list --json

# Create an OAuth app
shadowob oauth create --name "My App" --redirect-uri https://example.com/callback --json

# Update an app
shadowob oauth update <app-id> --name "New Name" --json

# Delete an app
shadowob oauth delete <app-id>

# Reset client secret
shadowob oauth reset-secret <app-id> --json

# List authorized apps (user consents)
shadowob oauth consents --json

# Revoke consent for an app
shadowob oauth revoke <app-id>
```

See [Platform Apps](/platform/platform-apps) for a complete guide to building apps with the OAuth API.

## API Token Commands

```bash
# List your API tokens
shadowob api-tokens list --json

# Create a new token
shadowob api-tokens create --name "CI Token" --scope read --expires-in-days 90 --json

# Delete a token
shadowob api-tokens delete <token-id>
```

## Discover Commands

```bash
# Browse the discovery feed
shadowob discover feed --type servers --limit 20 --json

# Search across public content
shadowob discover search --query "gaming" --type servers --limit 10 --json
```

## Profile Comment Commands

```bash
# View comments on a user's profile
shadowob profile-comments get <user-id> --limit 20 --json

# Leave a comment
shadowob profile-comments create --user-id <user-id> --content "Great profile!" --json

# Delete your comment
shadowob profile-comments delete <comment-id>
```

## Voice Enhancement Commands

```bash
# Enhance a voice transcript
shadowob voice-enhance enhance --transcript "Um so tomorrow maybe..." --language en-US --json

# Check voice enhancement config
shadowob voice-enhance config --json
```
