# API Reference

Shadow server exposes a REST API and Socket.IO WebSocket events.

## Base URL

- Development: `http://localhost:3002`
- Production: `https://shadowob.com` (or your self-hosted API domain)

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Auth Endpoints

| Method | Endpoint                         | Description                                               |
|--------|----------------------------------|-----------------------------------------------------------|
| POST   | `/api/auth/register`             | Create visitor account; invite code is optional           |
| POST   | `/api/auth/login`                | Password login; returns access and refresh tokens         |
| POST   | `/api/auth/email/start`          | Send email verification code                              |
| POST   | `/api/auth/email/verify`         | Verify email code and sign in or create visitor account   |
| POST   | `/api/auth/google/id-token`      | Google One Tap credential login                           |
| GET    | `/api/auth/me`                   | Get current user and membership status                    |
| GET    | `/api/membership/me`             | Get visitor/member capabilities                           |
| POST   | `/api/membership/redeem-invite`  | Redeem invite code for member capabilities                |
| GET    | `/api/play/catalog`              | Get git-backed homepage play catalog                      |
| POST   | `/api/play/launch`               | Launch a configured website play                          |
| GET    | `/api/ai/v1/models`              | List official OpenAI-compatible model proxy models         |
| GET    | `/api/ai/v1/billing`             | Show official proxy Shrimp Coin billing rates              |
| POST   | `/api/ai/v1/chat/completions`    | Create an official proxied chat completion                 |

Membership responses are tier-based and capability-driven. Clients should render the returned tier
instead of assuming only two states:

```json
{
  "status": "member",
  "tier": {
    "id": "member",
    "level": 10,
    "label": "Member",
    "capabilities": ["cloud:deploy", "server:create", "invite:create", "oauth_app:create"]
  },
  "level": 10,
  "isMember": true,
  "memberSince": "2026-05-03T00:00:00.000Z",
  "inviteCodeId": "invite-id",
  "capabilities": ["cloud:deploy", "server:create", "invite:create", "oauth_app:create"]
}
```

Advanced endpoints return `403` with code `INVITE_REQUIRED` when the current account is missing the
required capability.

Fast auth and play-launch paths can return `429` with code `RATE_LIMITED`. Clients should honor the
`Retry-After` header before retrying.

`GET /api/play/catalog` returns play cards, launch status, gates, action metadata, and linked git
templates. Every homepage play has a matching git-tracked template under
`apps/cloud/templates/*.template.json`; the app presents them through a unified landing page and keeps
internal setup out of the customer-facing flow.

`POST /api/play/launch` accepts a published `playId`, optional `launchSessionId`, and an
optional `inviteCode` when member capabilities are required:

```json
{
  "playId": "daily-brief",
  "launchSessionId": "launch-session-1",
  "inviteCode": "INVITE-CODE"
}
```

Raw play action objects are not accepted by the public endpoint. Actions must be published through
admin-managed website play config or the git-backed catalog. Missing actions return structured
codes such as `PLAY_NOT_CONFIGURED`, `PLAY_COMING_SOON`, `PLAY_MISCONFIGURED`, or
`PLAY_TARGET_UNAVAILABLE`; launch no longer falls back to Discover. Cloud template plays queue a real
Cloud SaaS deployment from the approved template content and return `deploymentId` while provisioning.
If a Cloud play needs the `cloud:deploy` capability, the server checks membership inside the same
launch request. When `inviteCode` is supplied, the server redeems it before continuing authorization;
clients do not need to call the membership endpoint first.
Once the deployment status is `deployed` and exposes `shadowServerId` plus `shadowChannelId`, clients
should redirect directly into that channel. Public channel and private room plays must point to an
already configured server; private rooms must also configure deployed `buddyUserIds`. The launcher
only joins, creates the private channel, adds the configured Buddy, and posts the greeting. It does
not create fake servers or fake Buddies for these actions. Cloud deploy plays post one provisioned
Buddy greeting after the deployment is ready. Cloud deployments are billed by runtime at 1 Shrimp
Coin per hour with 15-minute precision. The API checks that the wallet can cover the first hourly
unit before queueing, and the worker charges that first hourly unit when the runtime becomes live.
If the wallet cannot cover it, the API returns `402` with `WALLET_INSUFFICIENT_BALANCE`,
`requiredAmount`, `balance`, and `shortfall` so clients can show a task or recharge paywall.

## Official Model Proxy

The official model proxy exposes an OpenAI-compatible surface backed by server-side provider
configuration. Set `SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL` and `SHADOW_MODEL_PROXY_UPSTREAM_API_KEY`
for the upstream provider. Example and compose deployments default the base URL to DeepSeek's
OpenAI-compatible `https://api.deepseek.com`; the concrete upstream model can be changed with
`SHADOW_MODEL_PROXY_MODEL`. Public API responses and Cloud Pods use the `default` model alias so the
actual upstream model name stays server-side. Cloud templates and Pods receive a limited `smp_...`
model-proxy token in `OPENAI_COMPATIBLE_API_KEY`, never the real upstream key.

| Method | Endpoint                        | Description                            |
|--------|---------------------------------|----------------------------------------|
| GET    | `/api/ai/v1/models`             | List official model aliases            |
| GET    | `/api/ai/v1/billing`            | Show configured billing rates          |
| POST   | `/api/ai/v1/chat/completions`   | Proxy OpenAI-compatible chat requests  |

Requests accept either a normal Shadow bearer token or a limited model-proxy bearer token:

```http
Authorization: Bearer <shadow-token-or-smp-token>
```

The proxy reserves whole Shrimp Coins before calling upstream, settles against reported token usage
after the response, and refunds the reservation if the upstream request fails. Fractional model usage
is stored as micro-Shrimp accruals, so small requests are not rounded up forever just because wallet
balances are integers. By default the rates follow the official DeepSeek-style token categories:
cached input, uncached input, and output. Configure them with
`SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION`,
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION`,
`SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION`, and `SHADOW_MODEL_PROXY_SHRIMP_PER_CNY`; the default
exchange rate is 1 CNY = 20 Shrimp Coins, which derives defaults of 0.4 / 20 / 40 Shrimp Coins per
million cached input, uncached input, and output tokens. You can also configure the derived Shrimp rates directly
with `SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION`,
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION`, and
`SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION`. Legacy token-per-coin overrides are only used when
`SHADOW_MODEL_PROXY_BILLING_MODE=token_ratio`, through `SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP`, or
the separate `SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP` and
`SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP` values.

When the wallet cannot cover the reserve, the proxy does not expose an upstream-style error to chat.
It returns an OpenAI-compatible completion with `shadow.type = "wallet_recharge_required"` and
`X-Shadow-Recharge-Required: true`; Shadow clients turn the embedded marker into a recharge card:

```json
{
  "id": "chatcmpl-shadow-recharge-...",
  "object": "chat.completion",
  "choices": [{ "message": { "role": "assistant", "content": "<!-- shadow:wallet-recharge ... -->" } }],
  "shadow": {
    "type": "wallet_recharge_required",
    "requiredAmount": 2,
    "balance": 0,
    "shortfall": 2
  }
}
```

## Servers

| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/servers`                    | List user's servers      |
| POST   | `/api/servers`                    | Create a server          |
| GET    | `/api/servers/:id`                | Get server details       |
| GET    | `/api/servers/:id/access`         | Get the current user's server access status, including whether a private-server approval request is required or pending. |
| PUT    | `/api/servers/:id`                | Update server            |
| DELETE | `/api/servers/:id`                | Delete server            |
| POST   | `/api/servers/:id/join`           | Join a server            |
| POST   | `/api/servers/:id/join-requests`  | Request access to a private server. Approval by a server owner/admin adds the requester to the server and its public channels. |
| PATCH  | `/api/servers/join-requests/:requestId` | Approve or reject a private-server access request with `{ "status": "approved" \| "rejected" }`. |
| POST   | `/api/servers/:id/leave`          | Leave a server           |
| GET    | `/api/servers/:id/members`        | List server members      |

## Channels

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/servers/:serverId/channels`             | List server channels     |
| POST   | `/api/servers/:serverId/channels`             | Create a channel         |
| GET    | `/api/channels/:id`                           | Get channel details      |
| GET    | `/api/channels/:id/access`                    | Get the current user's channel access status, including whether a private-channel approval request is required or pending. |
| POST   | `/api/channels/:id/join-requests`             | Request access to a private channel. Private channels can be mentioned, but reading/sending requires channel membership or approval. |
| PATCH  | `/api/channel-join-requests/:requestId`       | Approve or reject a private-channel access request with `{ "status": "approved" \| "rejected" }`. |
| PUT    | `/api/channels/:id`                           | Update channel           |
| DELETE | `/api/channels/:id`                           | Delete channel           |

## Messages

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/channels/:channelId/messages`           | List channel messages    |
| POST   | `/api/channels/:channelId/messages`           | Send a message; accepts optional structured `mentions`, `metadata`, and arbitrary attachment types. Mentions are permission checked and canonicalized before persistence (`<@userId>`, `<#channelId>`, `<@server:serverId>`); the original display token may be sent as `sourceToken`. User/Buddy/broadcast mentions create mention notifications. Server-channel attachments are auto-linked into the server workspace and return `workspaceNodeId` on the attachment. Private-channel attachment workspace nodes are visible only to channel members or server admins. |
| GET    | `/api/mentions/suggest`                       | Suggest user, Buddy, channel, and server mentions for `channelId`, `trigger` (`@` or `#`), and optional `q`. Results include display insertion tokens plus stable target ids; clients should send structured mentions so the server can persist canonical references. |
| POST   | `/api/mentions/resolve`                       | Resolve message `content` plus optional client-provided `mentions` into permission-checked structured mentions. |
| GET    | `/api/threads/:id/messages`                   | List thread messages     |
| POST   | `/api/threads/:id/messages`                   | Send a thread message; accepts optional structured `mentions` and `metadata` |
| GET    | `/api/messages/:id`                           | Get message by ID        |
| GET    | `/api/messages/:id/interactive-state`         | Get current user's interactive block state |
| POST   | `/api/messages/:id/interactive`               | Submit interactive block action |
| PATCH  | `/api/messages/:id`                           | Edit a message           |
| DELETE | `/api/messages/:id`                           | Delete a message         |

Interactive message blocks are stored in `message.metadata.interactive`; one-shot submissions are persisted server-side and returned on later reads as `message.metadata.interactiveState.response`. Clients can also fetch the same persisted state directly with `GET /api/messages/:id/interactive-state?blockId=<blockId>`.

Commerce product cards are stored in `message.metadata.commerceCards`. Clients should add cards only from `GET /api/commerce/product-picker`; trusted Buddy tools may send a minimal Offer reference `{ "kind": "offer", "offerId": "..." }`. The server revalidates visibility, target scope, product status, and DM/server restrictions and rebuilds the product, price, and entitlement snapshot before persistence. Card purchase buttons call the commerce purchase endpoint instead of interactive block submission.

## Agents

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/agents`                                 | List agents              |
| POST   | `/api/agents`                                 | Create an agent          |
| POST   | `/api/agents/:id/heartbeat`                   | Record Buddy liveness; token must belong to the Buddy bot user |
| POST   | `/api/agents/:id/usage-snapshot`              | Report lightweight runtime usage telemetry; token must belong to the Buddy bot user |
| GET    | `/api/agents/:id/config`                      | Fetch remote config      |
| PUT    | `/api/agents/:id/slash-commands`              | Register slash commands  |
| GET    | `/api/agents/:id/slash-commands`              | List registered commands |
| GET    | `/api/channels/:id/slash-commands`            | List commands available in a channel |

Cloud cost dashboards read Buddy usage from `usage-snapshot` rows. They do not execute commands inside Kubernetes pods at request time.

## Cloud SaaS DIY Generation

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/cloud-saas/diy/plugins`                 | List official plugins available to the DIY generator |
| GET    | `/api/cloud-saas/diy/plugins/search?q=...`    | Search official DIY plugin capabilities |
| GET    | `/api/cloud-saas/diy/templates`               | List valid official templates available as references |
| POST   | `/api/cloud-saas/diy/generate`                | Generate a DIY Cloud draft as one JSON response |
| POST   | `/api/cloud-saas/diy/generate/stream`         | Create a one-day generation session and stream progress with SSE |
| GET    | `/api/cloud-saas/diy/sessions/:sessionId`     | Read a cached DIY generation session and its latest progress |
| GET    | `/api/cloud-saas/diy/sessions/:sessionId/stream` | Replay cached progress and continue streaming a running session |

DIY generation requires the `cloud:diy_generate` membership capability and is rate-limited per user. The streaming endpoint accepts the same JSON body as `/diy/generate`: `prompt`, optional `feedback`, optional bounded `previousConfig`, optional `locale`, and optional `timezone`. It returns `text/event-stream` events named `session`, `progress`, `draft`, `done`, and `error`. The initial `session` event includes a `sessionId` and `expiresAt`; sessions are scoped to the authenticated user and cached for one day. Each `progress` event includes the current step (`think`, `search`, `generate`, `validate`, or `review`) plus a status, localized detail text, optional structured metadata, and when a step finishes, an `output` object.

Each step `output` is a JSON object with this stable shape:

```json
{
  "type": "agent_step_output",
  "schemaVersion": 1,
  "step": "think",
  "status": "completed",
  "title": "Goal breakdown JSON output",
  "locale": "zh-CN",
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-05-09T00:00:00.000Z",
  "result": {},
  "reasons": [],
  "confidence": 0.86,
  "raw": {}
}
```

`result` contains the normalized step result used by the product UI. `reasons` explains why the Agent made that decision. `raw` contains the raw model/tool JSON for review, with secret-like values redacted before persistence. The final `draft` payload is the same deployable draft returned by the non-streaming endpoint, including `agentOutputs` for all five steps, an `agentReport` with objective decomposition, assumptions, plugin/template selection rationale, validation checks, and any repair notes applied before the template was accepted.

## Cloud SaaS Deployments

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/cloud-saas/deployments`                 | List current deployment instances; add `includeHistory=1` to include historical attempts |
| POST   | `/api/cloud-saas/deployments`                 | Create a new deployment instance; live namespaces are unique per user and cluster |
| GET    | `/api/cloud-saas/deployments/:id`             | Get a deployment attempt |
| GET    | `/api/cloud-saas/deployments/costs`           | Aggregate deployment usage snapshots from reported Buddy telemetry |
| GET    | `/api/cloud-saas/deployments/:id/costs`       | Get usage snapshots for one deployment |
| DELETE | `/api/cloud-saas/deployments/:id`             | Destroy the current deployment instance |
| POST   | `/api/cloud-saas/deployments/:id/redeploy`    | Enqueue a new attempt for the current deployment instance |
| POST   | `/api/cloud-saas/deployments/:id/cancel`      | Request cancellation of a pending or deploying attempt |
| GET    | `/api/cloud-saas/deployments/:id/logs`        | Stream deployment logs |

Deployment rows are attempt history; the stable deployment instance is identified by user, cluster, and namespace. `GET /api/cloud-saas/deployments` and `GET /api/cloud-saas/deployments/:id` include `blockedBy` when an earlier active task is holding the namespace queue, and `shadowServerId` / `shadowChannelId` when the completed deployment provisioned a Shadow server through the shadowob plugin. Creating a second live instance in the same namespace, redeploying a historical attempt, destroying a historical attempt, or mutating a namespace while another operation is active returns `409`.

## Cloud SaaS Provider Profiles

| Method | Endpoint                                      | Description              |
|--------|-----------------------------------------------|--------------------------|
| GET    | `/api/cloud-saas/provider-catalogs`           | List model provider catalogs from Cloud plugins |
| GET    | `/api/cloud-saas/provider-profiles`           | List encrypted provider profiles |
| PUT    | `/api/cloud-saas/provider-profiles`           | Create or update a provider profile |
| POST   | `/api/cloud-saas/provider-profiles/:id/test`  | Test provider credentials |
| POST   | `/api/cloud-saas/provider-profiles/:id/models/refresh` | Discover and persist provider models |
| DELETE | `/api/cloud-saas/provider-profiles/:id`       | Delete a provider profile |

Provider profile secrets are stored through the Cloud env var KMS path. Phase 1 supports API-key provider profiles only. Templates using the `model-provider` plugin receive matching runtime secrets and model metadata, including user-defined tags such as `default`, `fast`, `reasoning`, `vision`, and `tools`.

Provider profile APIs above are for user-owned encrypted credentials, model discovery, model tags, and deployment-time injection. The official server-owned proxy is exposed separately at `/api/ai/v1` and injects only limited model-proxy tokens into one-click Cloud plays.

## File Upload

| Method | Endpoint        | Description                 |
|--------|-----------------|-----------------------------|
| POST   | `/api/upload`   | Upload file (multipart)     |

Files are stored in MinIO (S3-compatible) and served via presigned URLs.

## Shop, Commerce, And Entitlements

Server shops continue to use `/api/servers/:serverId/shop`. Scope-neutral and personal-shop commerce endpoints support virtual services and subscription entitlements. Entitlements are resource capabilities expressed as `resourceType`, `resourceId`, and `capability`; legacy channel/app entitlement categories are no longer part of the API contract.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/me/shop` | Get or create the authenticated user's personal shop. Personal shops are visible only to logged-in users. |
| POST   | `/api/me/shop` | Update the authenticated user's personal shop metadata. |
| GET    | `/api/users/:userId/shop` | Get another user's visible personal shop. |
| GET/POST | `/api/users/:userId/shop/manage` | Manage a user's personal shop when the actor is that user or the owner of that user's Buddy account. |
| GET    | `/api/shops/:shopId` | Get a shop by id. |
| GET    | `/api/shops/:shopId/products` | List products for a server or personal shop. |
| GET    | `/api/products/:productId` | Get a visible product without knowing its shop scope. |
| GET/PUT/DELETE | `/api/shops/:shopId/products/:productId` | Read or manage a product in a scope-neutral shop. |
| POST   | `/api/shops/:shopId/products` | Create a product in a managed shop. Virtual services use `productType: "entitlement"` and `billingMode` of `fixed_duration` or `subscription`. |
| GET    | `/api/commerce/product-picker` | Return sendable Offer-backed `CommerceProductCard` records plus shop groups for `target=channel` or `target=dm`. Channel pickers include personal, server, and Buddy shops visible in the channel. |
| GET    | `/api/commerce/offers/:offerId/checkout-preview` | Return a server-trusted checkout snapshot for an Offer, including product, seller shop, entitlement resource, paid-file metadata, `viewerState`, `primaryAction`, `displayState`, and `nextAction`. Clients call this before showing buy confirmation or opening already-owned content. Sellers and selling Buddies may pass `viewerUserId` to inspect the current conversation user's state for their own Offer; wallet balance display data is returned only when inspecting yourself. |
| POST   | `/api/shops/:shopId/offers` | Create a managed shop Offer for a product. Offers define sales surface, seller/Buddy sender, optional price override, and metadata. |
| POST   | `/api/shops/:shopId/offers/:offerId/deliverables` | Attach a deliverable to an Offer. Phase 4 supports `kind: "paid_file"` with `resourceType: "workspace_file"` and a workspace file id. |
| POST   | `/api/commerce/offers/:offerId/purchase` | Buy an active Offer with `{ idempotencyKey, skuId?, destinationKind?, destinationId? }`. Orders complete immediately, grant Entitlements immediately, and enqueue fulfillment when a destination is supplied. |
| POST   | `/api/shops/:shopId/products/:productId/purchase` | Compatibility direct purchase path for an entitlement product. New chat flows should buy Offers. |
| POST   | `/api/messages/:messageId/commerce-cards/:cardId/purchase` | Buy from an Offer card embedded in channel message metadata. |
| POST   | `/api/dm/messages/:messageId/commerce-cards/:cardId/purchase` | Buy from an Offer card embedded in DM metadata. |
| GET    | `/api/paid-files/:fileId` | Check paid file metadata and whether the current user has an active entitlement. |
| POST   | `/api/paid-files/:fileId/open` | Mint a short-lived paid file grant for an entitled user and return a viewer URL. |
| GET    | `/api/paid-files/:fileId/view/:grantId` | Render a grant-protected paid file. The grant is short-lived and rechecks the entitlement before serving content. |
| GET    | `/api/entitlements` | List current user's entitlements across shop scopes, enriched with linked shop/product/offer summaries and paid-file metadata when the entitlement targets a paid file. |
| GET    | `/api/shops/:shopId/entitlements` | Merchant view of entitlements issued by a managed shop. |
| GET    | `/api/entitlements/:entitlementId/verify` | Verify current entitlement status and provisioning state. |
| POST   | `/api/entitlements/:entitlementId/cancel` | Cancel a subscription/entitlement immediately, revoke access, and issue the policy-defined pro-rated refund. |
| POST   | `/api/entitlements/:entitlementId/force-majeure-requests` | Merchant submits a force-majeure revocation request. Entitlement stays active until platform decision. |
| POST   | `/api/entitlement-review/:requestId/decision` | Platform reviewer decides force-majeure refund and revocation. |

## Wallet Display

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet/transactions?audience=consumer&direction=all\|income\|expense&limit=&offset=` | List the current user's wallet transactions. `audience=consumer` returns the ToC display view, excludes internal model-proxy reserve/adjustment ledger entries, and applies the `direction` filter on the server. |
| GET | `/api/wallet/transactions/count?audience=consumer&direction=all\|income\|expense` | Return the pagination count using the same display filters as the list endpoint. |

## Notifications

Notification creation is centralized behind server-side trigger services. Clients should treat each notification as an event record identified by `kind`, not by hardcoded title text.

| Method | Endpoint                                | Description |
|--------|-----------------------------------------|-------------|
| GET    | `/api/notifications`                    | List current user's notifications with `limit` and `offset`. Records include `kind`, `metadata`, `scopeServerId`, `scopeChannelId`, `scopeDmChannelId`, `aggregationKey`, and `aggregatedCount`. |
| PATCH  | `/api/notifications/:id/read`           | Mark one notification as read. The server scopes the update to the authenticated user. |
| POST   | `/api/notifications/read-all`           | Mark all notifications for the authenticated user as read. |
| POST   | `/api/notifications/read-scope`         | Mark unread notifications in a server/channel/DM scope as read with `{ serverId?, channelId?, dmChannelId? }`. At least one field is required. |
| GET    | `/api/notifications/unread-count`       | Return `{ count }` after applying user notification preferences and mute filters. |
| GET    | `/api/notifications/scoped-unread`      | Return `{ channelUnread, serverUnread, dmUnread }`, counting aggregated notifications by scope. |
| GET    | `/api/notifications/preferences`        | Get notification preferences: `strategy`, `mutedServerIds`, `mutedChannelIds`. |
| PATCH  | `/api/notifications/preferences`        | Update notification preferences. `strategy` is `all`, `mention_only`, or `none`. |
| GET    | `/api/notifications/channel-preferences` | Get per-kind/per-channel delivery preferences. |
| PATCH  | `/api/notifications/channel-preferences` | Upsert `{ kind, channel, enabled }` for channels such as `mobile_push`, `web_push`, `email`, `sms`, and `chat_system`. |
| POST   | `/api/notifications/push-tokens`        | Register a mobile push token for Expo delivery. |
| DELETE | `/api/notifications/push-tokens/:idOrToken` | Deactivate a mobile push token. |
| POST   | `/api/notifications/web-push-subscriptions` | Register a browser Web Push subscription. |
| DELETE | `/api/notifications/web-push-subscriptions/:idOrEndpoint` | Deactivate a Web Push subscription. |

Common notification kinds include `message.mention`, `message.reply`, `dm.message`, `channel.access_requested`, `channel.access_approved`, `channel.access_rejected`, `channel.member_added`, `server.access_requested`, `server.access_approved`, `server.access_rejected`, `server.member_joined`, `server.invite`, `friendship.request`, `recharge.succeeded`, `commerce.purchase_completed`, `commerce.renewal_failed`, and `commerce.subscription_cancelled`. User-facing copy should be rendered from i18n keys using `kind` and `metadata`; stored `title` and `body` are fallback text for older clients.

## WebSocket Events

Shadow uses Socket.IO for real-time communication. Connect to the same server URL with the auth token.

### Client → Server Events

| Event               | Payload                        | Description               |
|---------------------|--------------------------------|---------------------------|
| `channel:join`      | `{ channelId }`                | Join a channel room       |
| `channel:leave`     | `{ channelId }`                | Leave a channel room      |
| `message:send`      | `{ channelId, content, ... }`  | Send a message            |
| `typing:start`      | `{ channelId }`                | Start typing indicator    |
| `typing:stop`       | `{ channelId }`                | Stop typing indicator     |

### Server → Client Events

| Event               | Payload                        | Description               |
|---------------------|--------------------------------|---------------------------|
| `channel:message`   | `{ message }`                  | New message in channel    |
| `message:updated`   | `{ message }`                  | Message was edited        |
| `message:deleted`   | `{ messageId, channelId }`     | Message was deleted       |
| `channel:created`   | `{ channel }`                  | New channel created       |
| `channel:deleted`   | `{ channelId }`                | Channel was deleted       |
| `member:joined`     | `{ member, serverId }`         | New member joined server  |
| `member:left`       | `{ userId, serverId }`         | Member left server        |
| `typing`            | `{ userId, channelId }`        | User is typing            |
| `presence:update`   | `{ userId, status }`           | User online/offline       |
| `notification:new`  | `notification`                 | New notification event record |

## SDK Usage

For programmatic access, use the TypeScript or Python SDK instead of raw HTTP calls. See [SDK Usage](SDK-Usage.md) for details.
