# Play Launch Orchestration

## Goal

Website visitors should be able to click a play, sign in with the shortest viable path, see a focused play landing page, then enter a useful community or Cloud-backed experience with one click. Onboarding happens inside the play context rather than through a separate training flow.

## Product Model

Shadow separates account status from capability access. The current tier ladder starts with two
tiers, but the API is designed for more levels:

- `visitor` (`level: 0`): can register or sign in without an invite code, use community features, join public plays, and enter configured private play rooms.
- `member` (`level: 10`): has redeemed an invite code and can use advanced capabilities such as Cloud deployment, creating new servers, creating invite codes, and creating OAuth apps.

Invite codes no longer gate account creation. They gate advanced capabilities. Clients should render
the tier returned by the API instead of hard-coding a boolean visitor/member switch, because later
tiers can add more capability bundles without changing the play launch contract.

New accounts start with a zero-balance wallet and receive a one-time `welcome_signup` reward of
1000 Shrimp Coins through the task center. Cloud play deployments are billed by runtime at 1 Shrimp
Coin per hour with 15-minute precision. The launch API requires enough balance to cover the first
hourly unit before queueing a deployment, and the worker charges that first hourly unit when the
runtime becomes live; if the wallet cannot cover it, the API returns `402 WALLET_INSUFFICIENT_BALANCE`
and clients should show the beginner-task and recharge paths instead of exposing deployment
internals.

## Architecture

The website remains a configuration-driven catalog. It renders plays, topics, and landing pages from the public play catalog. Admin-managed config can override the catalog, but the baseline launchable plays live in git so production can be rebuilt from templates.

The app/server owns launch execution:

1. Website fetches `GET /api/play/catalog` and renders only the status/action returned by the server.
2. Website links to the app base URL plus `/app/play/launch?play=<play-id>`. Set `PUBLIC_APP_BASE_URL` or `WEBSITE_APP_BASE_URL` for the website build so docs/marketing routing does not intercept `/app` links.
3. If the user is not authenticated, the app redirects to login while preserving the launch URL.
4. Login supports Google One Tap, Google/GitHub OAuth, password login, and email verification code.
5. The app landing page presents customer-facing value and hides internal setup details. When the user clicks start, it shows a short launch animation while `POST /api/play/launch` executes idempotently by `launchSessionId`.
6. The API returns either a redirect URL or a Cloud deployment task id. Successful launch redirects use browser history replacement so Back returns to the website/homepage instead of the launch screen.

## Play Config

The baseline catalog is committed at `packages/shared/src/play-catalog/index.ts`. It binds:

- homepage copy and cover assets under `website/docs/public/home-assets`
- launch status: `available`, `gated`, `coming_soon`, or `misconfigured`
- one git-tracked Cloud template per homepage play under `apps/cloud/templates/*.template.json`

Admin publishes `homepage-plays-v2` as an array or `{ "plays": [...] }`. Each play can override the existing visual fields plus an `action`. The action is the source of truth for launch behavior:

- no existing server: use `cloud_deploy`, which queues a real Cloud SaaS deployment from the approved git template.
- existing server and existing Buddy: use `private_room` or `public_channel` with a configured `serverSlug` / `serverId` and explicit `buddyUserIds`. The launch service creates only the user-specific channel or join, never a fake server or fake Buddy.

```json
{
  "id": "daily-brief",
  "title": "每日简报",
  "titleEn": "Daily Brief",
  "image": "/home-assets/plays/daily-brief.jpg",
  "action": {
    "kind": "private_room",
    "serverSlug": "daily-brief-live",
    "namePrefix": "daily-brief",
    "buddyUserIds": ["00000000-0000-0000-0000-000000000000"],
    "greeting": "我已经准备好了，我们从今天最重要的三件事开始。"
  }
}
```

Supported actions:

- `public_channel`: join a configured public server and open a configured public channel. It can add and greet explicit `buddyUserIds`, but it does not deploy anything.
- `private_room`: create a private channel inside a configured server, add explicit deployed `buddyUserIds`, post a localized greeting, and redirect into that channel. Missing server or Buddy config is a `PLAY_MISCONFIGURED` / `PLAY_BUDDY_NOT_CONFIGURED` error.
- `cloud_deploy`: require membership, load the approved Cloud template from `apps/cloud/templates/<slug>.template.json`, queue a real Cloud SaaS deployment using that template as `configSnapshot`, and let the client keep the launch animation open until the deployment status is `deployed` and exposes `shadowServerId` plus the preferred `shadowChannelId`. It must not create a fake community room as a stand-in for Cloud. When the deployment finishes, the provisioned Buddy posts one greeting in the selected channel.
- `external_oauth_app`: start Shadow OAuth authorization for a third-party app.
- `landing_page`: redirect to a configured page.

Missing or invalid actions return structured errors such as `PLAY_NOT_CONFIGURED`, `PLAY_COMING_SOON`, `PLAY_MISCONFIGURED`, or `PLAY_TARGET_UNAVAILABLE`. The launch service no longer silently falls back to Discover.

## Membership Gates

The server enforces capabilities rather than tier names:

- `cloud:deploy`
- `server:create`
- `invite:create`
- `oauth_app:create`

Clients should treat a `403` with `INVITE_REQUIRED` as a prompt to redeem an invite code, not as an authentication failure.

Membership payload shape:

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
  "inviteCodeId": "00000000-0000-0000-0000-000000000000",
  "capabilities": ["cloud:deploy", "server:create", "invite:create", "oauth_app:create"]
}
```

See `docs/product/membership-tiers.md` for the extensibility rules.

## APIs

### Auth

- `POST /api/auth/register`: creates a visitor account by default. `inviteCode` is optional; when valid, it upgrades the new account to member.
- `POST /api/auth/email/start`: sends a one-time verification code.
- `POST /api/auth/email/verify`: verifies the code and signs in or creates a visitor account.
- `POST /api/auth/google/id-token`: accepts a Google One Tap credential and returns Shadow tokens.

### Membership

- `GET /api/membership/me`: returns visitor/member status and capabilities.
- `POST /api/membership/redeem-invite`: redeems an invite code for membership.

### Play Launch

- `GET /api/play/catalog`: returns the public homepage play catalog.
- `POST /api/play/launch`: launches a configured play by `playId`. Clients may send `launchSessionId` for retry/idempotency and `inviteCode` when the launch is gated by membership. Cloud plays redeem the invite code server-side before checking `cloud:deploy`, return `deploymentId` while the real template deployment is pending, and may return `redirectUrl` immediately if the template has already provisioned a Shadow server. The public API does not accept raw action objects; actions must come from published admin config. Website/app clients should call it only after the landing page start action, not automatically on page load.

### Official Model Proxy

- `GET /api/ai/v1/models`: returns the official OpenAI-compatible model list.
- `POST /api/ai/v1/chat/completions`: proxies OpenAI-compatible chat completions to the configured official upstream and bills Shrimp Coins by measured usage.

The official upstream key stays only in the server process. Configure the upstream with
`SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL` and `SHADOW_MODEL_PROXY_UPSTREAM_API_KEY`. The example and
compose deployments default the upstream base URL to DeepSeek's OpenAI-compatible
`https://api.deepseek.com`; production can switch it and the default `deepseek-v4-flash` model
through environment variables. Cloud templates and Pods never receive the real upstream key or concrete
upstream model name.
One-click Cloud plays receive
`OPENAI_COMPATIBLE_BASE_URL=/api/ai/v1` and a limited `smp_...` model proxy token in
`OPENAI_COMPATIBLE_API_KEY`. The OpenClaw config selects the public `default` alias; the server maps it
to the configured upstream model. The token is only valid for the model proxy and is not accepted as a
general Shadow user token.

The proxy reserves whole Shrimp Coins before calling the upstream provider, then settles against
reported token usage with micro-Shrimp accruals so the integer wallet can still charge fractional
model usage accurately. Default pricing follows DeepSeek-style categories: cached input, uncached
input, and output, configured by `SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION`,
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION`,
`SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION`, and `SHADOW_MODEL_PROXY_SHRIMP_PER_CNY` (default
1 CNY = 20 Shrimp Coins; derived defaults are 0.4 / 20 / 40 Shrimp Coins per million cached input,
uncached input, and output tokens), or directly by
`SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION`,
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION`, and
`SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION`. Token-per-coin overrides remain available only when
`SHADOW_MODEL_PROXY_BILLING_MODE=token_ratio`, with `SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP`, or
separate `SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP` and
`SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP` values. When the wallet cannot cover the reserve, the
proxy returns an OpenAI-compatible recharge completion instead of surfacing an upstream-style error;
Shadow chat renders that marker as a recharge/task card.

### App Routing

Inside the authenticated app, entering `/app/servers/:serverSlug` redirects to the first available
channel. If the server has no channel yet, the app shows a focused empty state. Play launch Cloud
actions can set `defaultChannelName`; when the template provisions that channel, launch redirects
directly into it.

## Future Template Runtime

The current git templates intentionally keep the first playable surface narrow: server, channel,
Buddy, and model-provider wiring. The next template layer should extend this into explicit
`scripts`, `skills`, `cli`, and `mcp` blocks so plays can ship richer capabilities without becoming
generic chatbot rooms.

## Abuse Protection

The fast path is protected by lightweight throttling:

- auth entry endpoints (`register`, `login`, `email/verify`, `google/id-token`): 20 requests per minute per client.
- email code send (`email/start`): 5 requests per 10 minutes per client.
- play launch (`POST /api/play/launch`): 30 requests per minute per authenticated user.

Rate limited requests return `429` with `RATE_LIMITED` and `Retry-After`.

## Rollout

1. P0: invite optional registration, email code auth, membership gate.
2. P1: website play links and app launch page.
3. P2: git catalog provides the first real public/private/cloud plays; admin config only overrides.
4. P3: Cloud deploy plays and invite redemption UI.
5. P4: third-party OAuth plays and analytics.
