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
- `agents` / `marketplace` — AI agent ecosystem
- `workspace` / `apps` / `shop` — platform workflows
- `oauth` — OAuth app management (create, list, reset-secret, consents, revoke)
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

See [Platform Apps](/api-doc/platform-apps) for a complete guide to building apps with the OAuth API.
