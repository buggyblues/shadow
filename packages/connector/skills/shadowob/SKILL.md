---
name: shadowob
description: "Use when live Shadow context or actions are needed: channel/DM history, pins, members, server/channel/workspace/shop/app/buddy data, or sending/managing Shadow content via the shadowob CLI."
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
pinned messages, member/server/channel state, workspace/shop/app/buddy data, or when you need to
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
shadowob channels list --server <server> --json

# Get channel
shadowob channels get <channel-id> --json

# Create/Delete
shadowob channels create --server <server> --name <name> [--type text] --json
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

## Buddy Inbox Task Cards

Inbox tasks are ordinary channel messages with `metadata.cards[]` entries where `kind="task"`.
When a task card is assigned to the current Buddy, treat it as an explicit trigger even if the
channel normally requires mentions.

You are not statically bound to one server. Resolve the active server from the current message, Inbox task, or App command context before calling the CLI. When routing work to another Buddy, do not create ordinary channels as Inbox routes; use that Buddy's Inbox and task cards.

```bash
# Discover or repair Inbox channels
shadowob inbox list --server <server-id-or-slug> --json
shadowob inbox ensure --server <server-id-or-slug> --agent <agent-id> --json

# Enqueue a task card when acting as an authorized tool or App operator
shadowob inbox enqueue --server <server-id-or-slug> --agent <agent-id> --title "Task title" --body "Task body" --requirements-json '<json>' --output-contract-json '<json>' --privacy-json '<json>' --json

# Claim the next task from a Buddy Inbox
shadowob inbox claim-next --server <server-id-or-slug> --agent <agent-id> --json

# Claim/update a known task card
shadowob inbox claim <message-id> <card-id> --json
shadowob inbox update <message-id> <card-id> --status running --note "Started" --json
shadowob inbox update <message-id> <card-id> --status completed --note "Done" --json
shadowob inbox retry <message-id> <card-id> --note "Retry after fixing input" --json

# Turn an existing chat message into a Buddy Inbox task
shadowob inbox promote <message-id> --server <server-id-or-slug> --agent <agent-id> --title "Task title" --json
```

Runner contract:

- Read `metadata.cards` before deciding whether to skip a message.
- Accept active task cards assigned to your `agentId` or bot `userId`.
- Treat `requirements`, `outputContract`, and `privacy` as first-class task fields.
- Claim before work, mark `running` while working, then mark `completed` or `failed` with a concise note.
- Reply to the Inbox task message when you need the owner to see a human-readable result.
- prefer Workspace files for shared context and artifacts. Cache Workspace folder and file ids when you create or discover reusable locations.
- Upload final artifacts to Workspace first, then reference them with `workspaceFileId`, `workspaceNodeId`, or a `workspace://path/to/file` URI instead of runtime-local paths.

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

## Buddies

```bash
# List buddies
shadowob buddies list --json

# Get buddy
shadowob buddies get <buddy-id> --json

# Create/Update/Delete
shadowob buddies create --name <name> --username <username> [--display-name <name>] [--avatar-url <url>] --json
shadowob buddies update <buddy-id> [--name <name>] [--display-name <name>] --json
shadowob buddies delete <buddy-id>

# Control
shadowob buddies start <buddy-id>
shadowob buddies stop <buddy-id>

# Token
shadowob buddies token <buddy-id> --json

# Config
shadowob buddies config <buddy-id> --json
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
shadowob workspace files download <server-id> <file-id> --output <local-path> --json

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
shadowob shop get-by-id <shop-id> --json
shadowob shop me get --json

# Products
shadowob shop products list <server-id> [--status active] [--keyword <text>] [--limit <n>] --json
shadowob shop products list-by-shop <shop-id> [--status active] [--limit <n>] --json
shadowob shop products get <server-id> <product-id> --json
shadowob shop products purchase <shop-id> <product-id> --idempotency-key <unique-operation-id> --json

# Offers, deliverables, and shop assets
shadowob shop offers list <shop-id> --json
shadowob shop offers create <shop-id> --data '<offer-json>' --json
shadowob shop offers deliverables create <shop-id> <offer-id> --data '<deliverable-json>' --json
shadowob shop assets list <shop-id> --json
shadowob shop assets create <shop-id> --data '<asset-definition-json>' --json
shadowob shop entitlements list <shop-id> --json

# Cart
shadowob shop cart list <server-id> --json

# Orders
shadowob shop orders list <server-id> --json
shadowob shop orders get <server-id> <order-id> --json

# Wallet
shadowob shop wallet balance --json
```

## Commerce

```bash
# Product and offer buyer context
shadowob commerce products context <product-id> --json
shadowob commerce offers preview <offer-id> --json
shadowob commerce offers purchase <offer-id> --idempotency-key <unique-operation-id> --json

# Chat commerce cards
shadowob commerce cards list --channel-id <channel-id> [--keyword <text>] --json
shadowob commerce cards purchase <message-id> <card-id> --idempotency-key <unique-operation-id> --json

# Purchases, delivery, protected files, and community assets
shadowob commerce entitlements list [--server <server>] --json
shadowob commerce entitlements get <entitlement-id> --json
shadowob commerce entitlements verify <entitlement-id> --json
shadowob commerce paid-files open <file-id> --json
shadowob commerce assets list --json
shadowob commerce assets consume <grant-id> --idempotency-key <unique-operation-id> --json

# Seller income and support actions
shadowob commerce settlements list --json
shadowob commerce settlements settle --json
shadowob commerce tips send --recipient-user-id <user-id> --amount <shrimp> [--message <text>] --json
shadowob commerce gifts send --recipient-user-id <user-id> --assets '<json-array>' --json
```

## Commerce Validation Notes

- Use the CLI for setup, inspection, and automation, but validate commerce user stories in the
  browser before calling them complete.
- Do not add seed code to populate commerce surfaces. Create ordinary local/test records through
  browser flows or explicit setup calls.
- When inspecting a commerce flow, preserve ids for the handoff: product, offer, order,
  entitlement, shop, server, Buddy, and workspace file where applicable.
- External app entitlement automation must use Shadow OAuth commerce APIs and remain scoped to the
  app's own `external_app` resource namespace.

## Apps

```bash
# App integrations
shadowob app list --server <server-id-or-slug> --json
shadowob app preview --server <server-id-or-slug> --manifest-url <manifest-url> --json
shadowob app install --server <server-id-or-slug> --manifest-url <manifest-url> --json
shadowob app publish --server <server-id-or-slug> --manifest-file shadow-app.local.json --base-url <stable-https-app-url> --json
shadowob app uninstall <app-key> --server <server-id-or-slug>
shadowob app discover --server <server-id-or-slug> --json
shadowob app inspect <app-key> --server <server-id-or-slug> --json
shadowob app skills <app-key> --server <server-id-or-slug>
shadowob app call <app-key> <command> --server <server-id-or-slug> --channel-id <channel-id> --json-input '<raw-command-input-json>' --json
shadowob app call <app-key> <command> --server <server-id-or-slug> --help
shadowob app call <app-key> <command> --server <server-id-or-slug> --file <path> --json-input '<raw-command-input-json>' --json
shadowob app events <app-key> --server <server-id-or-slug> --json
```

When building or modifying an App in an agent runtime, use the separate mounted
`shadow-server-app` skill. This `shadowob` skill covers operating installed Apps through the CLI;
the App development skill covers development, publish, expose, persistence, and backup guidance.

For App commands, use the `shadowob app` CLI path only. Do not use curl, fetch, raw HTTP
routes, or the JavaScript SDK to call App commands. Pass the command input object directly
to `--json-input`, for example `{"title":"Example","priority":"high"}`; the CLI wraps the HTTP
request for you and binds Shadow OAuth identity, server membership, App grants, and command policy.
Use progressive disclosure: start with `shadowob app skills` or `shadowob app discover`, then call
`shadowob app call <app-key> <command> --server <server> --help` only when you need that command's
full schema, file-upload support, or examples. For realtime app updates, subscribe with
`shadowob app events <app-key> --server <server> --json` instead of polling.
When a channel message mentions an App, use the mentioned app key/server id directly and pass
the current channel id with `--channel-id` when available. If an App command requires
approval, do not send a chat form or call the approval endpoint yourself as a Buddy. Wait for a
person to confirm the Shadow approval popup, then retry the original command.

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

# External app commerce entitlement checks use OAuth access tokens, not user JWTs
shadowob oauth commerce check --access-token <oauth-access-token> --resource-id <app-id>:premium --json
shadowob oauth commerce redeem --access-token <oauth-access-token> --resource-id <app-id>:premium --idempotency-key <provider-operation-id> --json
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
shadowob media upload --file <path> [--server <server>] [--channel-id <id>] --json

# Download a file
shadowob media download <file-url> [--output <path>]
```

## Search

```bash
# Search messages
shadowob search messages --query <text> [--server <server>] [--channel-id <id>] [--author-id <id>] [--after <date>] [--before <date>] [--has-attachments] [--limit <n>] --json
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
