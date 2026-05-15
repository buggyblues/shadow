---
name: shadowob
description: "Use when live Shadow context or actions are needed: channel/DM history, pins, members, server/channel/workspace/shop/app/agent data, or sending/managing Shadow content via the shadowob CLI."
metadata:
  {
    "openclaw":
      {
        "emoji": "🏠",
        "requires": { "bins": ["shadowob"] },
        "primaryEnv": "SHADOWOB_TOKEN",
      },
  }
---
allowed-tools: ["exec"]

# Shadow CLI

Use `shadowob` CLI to interact with Shadow servers.

Activate this skill when you need current Shadow context, such as recent channel or DM history,
pinned messages, member/server/channel state, workspace/shop/app/agent data, or when you need to
send or manage Shadow content. Prefer narrow `--json` reads before acting.

## Quickstart

```bash
# Login (one-time setup)
shadowob auth login --server-url https://shadowob.com --token <jwt>

# List servers
shadowob servers list --json

# Send a message
shadowob channels send <channel-id> --content "Hello" --json
```

## Authentication

Set token via:
1. `shadowob auth login` (persistent, stored in `~/.shadowob/shadowob.config.json`)
2. `--profile <name>` to use a specific profile
3. `SHADOWOB_TOKEN` env var (used by SDK directly)

### Profile Commands

```bash
shadowob auth login --server-url <url> --token <token> --profile <name>
shadowob auth switch <profile>
shadowob auth list
shadowob auth whoami
shadowob auth logout --profile <name>
```

## Servers

```bash
# List joined servers
shadowob servers list --json

# Get server details
shadowob servers get <server-id> --json

# Create server
shadowob servers create --name "My Server" --slug myserver --json

# Join/Leave
shadowob servers join <server-id> [--invite-code <code>]
shadowob servers leave <server-id>

# Members
shadowob servers members <server-id> --json

# Discover public servers
shadowob servers discover --json
```

## Channels

```bash
# List channels
shadowob channels list --server-id <server-id> --json

# Get channel
shadowob channels get <channel-id> --json

# Create/Delete
shadowob channels create --server-id <id> --name <name> [--type text] --json
shadowob channels delete <channel-id>

# Messages
shadowob channels messages <channel-id> [--limit 50] [--cursor <cursor>] --json
shadowob channels send <channel-id> --content "text" [--reply-to <id>] [--thread-id <id>] --json
shadowob channels edit <message-id> --content "new text" --json
shadowob channels delete-message <message-id>

# Reactions
shadowob channels react <message-id> --emoji 👍
shadowob channels unreact <message-id> --emoji 👍

# Pins
shadowob channels pin <message-id> [--channel-id <id>]
shadowob channels unpin <message-id> [--channel-id <id>]
shadowob channels pinned <channel-id> --json
```

## Threads

```bash
# List threads
shadowob threads list <channel-id> --json

# Get thread
shadowob threads get <thread-id> --json

# Create/Delete
shadowob threads create <channel-id> --name <name> --parent-message <id> --json
shadowob threads delete <thread-id>

# Messages
shadowob threads messages <thread-id> [--limit 50] --json
shadowob threads send <thread-id> --content "text" --json
```

## Direct Messages (DMs)

```bash
# List DM channels
shadowob dms list --json

# Get DM channel
shadowob dms get <dm-channel-id> --json

# Create DM channel
shadowob dms create --user-id <user-id> --json

# Messages
shadowob dms messages <dm-channel-id> [--limit 50] --json
shadowob dms send <dm-channel-id> --content "text" --json

# Delete DM channel
shadowob dms delete <dm-channel-id>
```

## Agents

```bash
# List agents
shadowob agents list --json

# Get agent
shadowob agents get <agent-id> --json

# Create/Update/Delete
shadowob agents create --name <name> [--display-name <name>] [--avatar-url <url>] --json
shadowob agents update <agent-id> [--name <name>] [--display-name <name>] --json
shadowob agents delete <agent-id>

# Control
shadowob agents start <agent-id>
shadowob agents stop <agent-id>

# Token
shadowob agents token <agent-id> --json

# Config
shadowob agents config <agent-id> --json
```

## Workspace

```bash
# Workspace info
shadowob workspace get <server-id> --json
shadowob workspace tree <server-id> --json
shadowob workspace stats <server-id> --json

# Children
shadowob workspace children <server-id> [--parent-id <id>] --json

# Files
shadowob workspace files get <server-id> <file-id> --json
shadowob workspace files upload <server-id> --file <path> [--name <name>] [--parent-id <id>] --json
shadowob workspace files update <server-id> <file-id> [--name <name>] [--parent-id <id>] --json
shadowob workspace files delete <server-id> <file-id>
shadowob workspace files search <server-id> [--search-text <text>] [--ext <ext>] [--parent-id <id>] --json
# Note: files download is not yet implemented in CLI; download via contentRef URL instead.

# Folders
shadowob workspace folders create <server-id> --name <name> [--parent-id <id>] --json
shadowob workspace folders update <server-id> <folder-id> [--name <name>] [--parent-id <id>] --json
shadowob workspace folders delete <server-id> <folder-id>
```

### Workspace Node Metadata

Each workspace node has a `flags` JSONB field with optional metadata:

- **Access control**: `flags.access = { scope: "server" | "channel", serverId, channelId? }`. All nodes have at least `scope: "server"` + `serverId`. Channel-scoped nodes require channel membership for access.
- **Traceability**: `flags.source = "channel_message_attachment"` with `channelId` and `messageId` for files uploaded via channel messages, enabling reverse lookup to the originating message.
- **Path is server-computed**: `path` is derived from parent path + name, maintained server-side. Do not set path manually — it is auto-updated on rename/move.

## Shop

```bash
# Shop info
shadowob shop get <server-id> --json

# Products
shadowob shop products list <server-id> --json
shadowob shop products get <server-id> <product-id> --json

# Cart
shadowob shop cart list <server-id> --json

# Orders
shadowob shop orders list <server-id> --json
shadowob shop orders get <server-id> <order-id> --json

# Wallet
shadowob shop wallet balance --json
```

## Apps

```bash
# Server App integrations
shadowob app list --server <server-id-or-slug> --json
shadowob app preview --server <server-id-or-slug> --manifest-url <manifest-url> --json
shadowob app discover --server <server-id-or-slug> --json
shadowob app inspect <app-key> --server <server-id-or-slug> --json
shadowob app skills <app-key> --server <server-id-or-slug>
shadowob app call <app-key> <command> --server <server-id-or-slug> --json-input '<raw-command-input-json>' --json
```

For server App commands, use the `shadowob app` CLI path only. Do not use curl, fetch, raw HTTP
routes, or the JavaScript SDK to call server App commands. Pass the command input object directly
to `--json-input`, for example `{"title":"Example","priority":"high"}`; the CLI wraps the HTTP
request for you and binds Shadow OAuth identity, server membership, App grants, and command policy.
When a channel message mentions a server App, use the mentioned app key/server id directly.

```bash
# Legacy workspace apps
shadowob apps list <server-id> --json

# Get app
shadowob apps get <app-id> --json

# Create/Update/Delete
shadowob apps create <server-id> --name <name> --type <url|workspace|static> [--source-url <url>] [--description <desc>] [--settings <json>] --json
shadowob apps update <app-id> [--name <name>] [--description <desc>] [--source-url <url>] [--settings <json>] --json
shadowob apps delete <app-id>

# Publish from workspace
shadowob apps publish <server-id> --folder-id <id> [--name <name>] [--description <desc>] --json

# Download source
shadowob apps download <app-id> [--output <path>]
```

## Notifications

```bash
# List notifications
shadowob notifications list [--unread-only] [--limit <n>] --json

# Get/Read/Delete
shadowob notifications get <notification-id> --json
shadowob notifications mark-read <notification-id>
shadowob notifications mark-all-read
shadowob notifications delete <notification-id>

# Preferences
shadowob notifications preferences get --json
shadowob notifications preferences update [--email-enabled <bool>] [--push-enabled <bool>] [--mentions-only <bool>] --json
```

## Friends

```bash
# List friends
shadowob friends list --json

# Friend requests
shadowob friends requests [--incoming] [--outgoing] --json
shadowob friends add <username> [--message <text>] --json
shadowob friends accept <request-id> --json
shadowob friends reject <request-id> --json

# Remove friend
shadowob friends remove <friendship-id> --json
```

## Invites

```bash
# List your invite codes
shadowob invites list --json

# Create invite code
shadowob invites create [--max-uses <n>] [--expires-in <hours>] --json

# Deactivate/Delete invite
shadowob invites deactivate <invite-id>
shadowob invites delete <invite-id>
```

## OAuth

```bash
# List OAuth apps
shadowob oauth list --json

# Create OAuth app
shadowob oauth create --name <name> [--description <desc>] [--redirect-uri <uri>] [--homepage <url>] --json

# Update/Delete OAuth app
shadowob oauth update <app-id> [--name <name>] [--description <desc>] [--redirect-uri <uri>] [--homepage <url>] --json
shadowob oauth delete <app-id>

# Reset client secret
shadowob oauth reset-secret <app-id> --json

# List authorized apps (user consents)
shadowob oauth consents --json

# Revoke consent for an app
shadowob oauth revoke <app-id>
```

## Marketplace

```bash
# Listings
shadowob marketplace listings list [--agent-id <id>] [--min-price <n>] [--max-price <n>] --json
shadowob marketplace listings get <listing-id> --json
shadowob marketplace listings create --agent-id <id> --price <n> [--description <text>] --json
shadowob marketplace listings update <listing-id> [--price <n>] [--description <text>] [--active <bool>] --json
shadowob marketplace listings delete <listing-id>

# Contracts
shadowob marketplace contracts list [--as-renter] [--as-owner] [--active-only] --json
shadowob marketplace contracts get <contract-id> --json
shadowob marketplace contracts create --listing-id <id> --hours <n> [--note <text>] --json
shadowob marketplace contracts cancel <contract-id>
shadowob marketplace contracts extend <contract-id> --hours <n> --json
```

## Media

```bash
# Upload a file
shadowob media upload --file <path> [--server-id <id>] [--channel-id <id>] --json

# Download a file
shadowob media download <file-url> [--output <path>]
```

## Search

```bash
# Search messages
shadowob search messages --query <text> [--server-id <id>] [--channel-id <id>] [--author-id <id>] [--after <date>] [--before <date>] [--has-attachments] [--limit <n>] --json
```

## Listen (Real-time Events)

```bash
# Stream mode: listen until timeout or count
shadowob listen channel <channel-id> --mode stream [--timeout 60] [--count 10] --json

# Poll mode: fetch recent messages
shadowob listen channel <channel-id> --mode poll [--last 50] --json

# Filter events
shadowob listen channel <id> --event-type message:new,reaction:add --json

# DM events
shadowob listen dm <dm-channel-id> [--timeout 60] --json
```

## Output Format

- Default: human-readable list format
- `--json`: JSON output for programmatic use

## Error Handling

Commands exit with code 1 on error. Use `--json` to get structured errors:

```json
{ "error": "message" }
```
