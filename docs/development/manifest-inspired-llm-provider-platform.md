# Manifest-Inspired LLM Provider Platform

## Source Reference

This design references the open-source Manifest project:

- Repository: https://github.com/mnfst/manifest
- Reference commit inspected locally: `97821cf486c8305ecf52efacca787167d70863bb`
- License: MIT, see upstream `LICENSE`

Relevant upstream files inspected:

- `README.md`
- `CLAUDE.md`
- `packages/shared/src/providers.ts`
- `packages/frontend/src/services/providers.ts`
- `packages/frontend/src/components/ProviderSelectContent.tsx`
- `packages/frontend/src/components/ProviderKeyForm.tsx`
- `packages/frontend/src/components/CustomProviderForm.tsx`
- `packages/frontend/src/pages/Routing.tsx`
- `packages/frontend/src/pages/RoutingTierCard.tsx`
- `packages/frontend/src/components/FallbackList.tsx`
- `packages/frontend/src/services/api/routing.ts`
- `packages/backend/src/routing/provider.controller.ts`
- `packages/backend/src/routing/tier.controller.ts`
- `packages/backend/src/routing/model.controller.ts`
- `packages/backend/src/routing/proxy/proxy.controller.ts`
- `packages/backend/src/routing/proxy/provider-endpoints.ts`
- `packages/backend/src/routing/proxy/proxy-rate-limiter.ts`
- `packages/backend/src/routing/proxy/proxy-fallback.service.ts`
- `packages/backend/src/routing/qwen-region.ts`
- `packages/backend/src/model-discovery/provider-model-fetcher.service.ts`
- `packages/backend/src/model-discovery/model-discovery.service.ts`
- `packages/backend/src/entities/user-provider.entity.ts`
- `packages/backend/src/entities/tier-assignment.entity.ts`

## Manifest Feature Inventory

Manifest is not only an API-key vault. It is an LLM gateway for personal agents. Its core loop is:

1. Connect provider credentials.
2. Discover models from provider-native APIs.
3. Enrich models with pricing and capability metadata.
4. Assign models to routing tiers.
5. Proxy OpenAI-compatible requests.
6. Enforce rate limits and concurrency limits.
7. Fallback to alternate models/providers on upstream failures.
8. Record tokens, latency, cost, model choice, fallback metadata, and provider errors.

### Provider Hosting

Manifest stores provider connections per agent. A provider connection has:

- Provider id and display metadata from a shared registry.
- Auth type: `api_key`, `subscription`, or `local`.
- Encrypted credential, masked prefix, region, active flag.
- Cached model discovery result and `models_fetched_at`.
- Support for local providers and OpenAI-compatible custom providers.

Provider registry features:

- Canonical provider IDs and aliases.
- OpenRouter vendor prefixes for pricing/model attribution.
- Provider UI metadata: display name, color, key prefix, placeholder, local-only flag.
- Provider-specific subscription modes and local server hints.

### Model Discovery

Manifest fetches model lists from native provider APIs first:

- OpenAI-compatible `/models` endpoints.
- Anthropic `/v1/models`.
- Gemini `generativelanguage.googleapis.com` model list.
- OpenRouter pricing/model catalog.
- Ollama and local server tags.

Fallback sources:

- `models.dev` cache where available.
- OpenRouter pricing cache filtered by vendor prefix.
- Curated known models for subscription or provider gaps.

Model metadata:

- Model id and display name.
- Provider id and auth type.
- Context window.
- Input/output price per token.
- Reasoning/code capability hints.
- Quality score for auto assignment.

### Routing

Manifest has a two-layer routing system:

- Complexity tiers: `simple`, `standard`, `complex`, `reasoning`.
- A default route for normal traffic.
- Optional specificity categories such as coding, browsing, data analysis, image generation, video generation, social media, email, calendar, and trading.

Each route can hold:

- Auto-assigned model.
- Manual override model/provider/auth type.
- Up to five fallback models.

The route resolver chooses:

1. Specificity route if enabled.
2. Complexity route.
3. Default route.
4. Provider/model.
5. Fallback chain.

### Proxy

Manifest exposes an OpenAI-compatible proxy:

- `POST /v1/chat/completions`
- Authenticated by agent API key.
- Applies routing before forwarding to upstream provider.
- Handles streaming and non-streaming responses.
- Adapts provider-specific APIs such as Anthropic and Google.
- Emits routing metadata headers.
- Sanitizes provider errors so keys are not leaked.

### Fallback

Fallback behavior is first-class:

- Fallback list per route.
- Retries alternate provider/model combinations after upstream transport failures.
- Tracks failed fallback attempts.
- Avoids reusing an auth type already known to fail for the same provider during one request.
- Records whether the final response came from a fallback.

### Limits

Manifest enforces proxy-level guardrails:

- Per-user requests per minute.
- Per-IP requests per minute.
- Per-user concurrent request slots.
- Friendly 429 responses for clients.

It also includes notification rules for token and cost thresholds.

### Billing and Observability

Manifest records LLM calls and analytics:

- Request model and response model.
- Input/output/cache tokens.
- Duration and time to first token.
- Cost derived from pricing metadata.
- Provider, route tier, routing reason, auth type, fallback source.
- Dashboards for overview, messages, tokens, costs, and per-agent usage.

## Shadow Phase 1 Scope

The first Shadow phase focuses on frontend interaction and backend API contracts. It deliberately avoids a full upstream proxy implementation until the provider vault, route policy, and model catalog shape are stable.

### In Scope

- Replace the current simple provider page with a Manifest-inspired LLM Gateway console.
- Keep the existing encrypted provider profile storage.
- Support API-key provider profiles only in the product UI and public API contract. Manifest subscription/device-code/local flows are intentionally out of scope for this phase.
- Add first-class catalog coverage for Manifest's commonly used China-friendly providers: Alibaba/Qwen, MiniMax, Moonshot/Kimi, Z.ai, and DeepSeek.
- Extend provider profiles with:
  - `apiFormat`: `openai`, `anthropic`, or `gemini`
  - `authType`: `api_key`
  - `baseUrl`
  - `models`
  - model cost, tags, context, max output, and capability metadata
  - `discoveredAt`
- Add model discovery API:
  - `POST /provider-profiles/:id/models/refresh`
  - Calls the profile's provider-native or OpenAI-compatible `/models` endpoint.
  - Persists discovered model metadata back to the encrypted profile config.
- Add routing policy API:
  - `GET /provider-routing`
  - `PUT /provider-routing`
  - `POST /provider-routing/resolve`
- Routing policy includes:
  - default route
  - complexity routes
  - per-route primary model and fallback models
  - limits: requests per minute, concurrent requests, monthly budget
  - alert and hard-limit rules for token/cost thresholds
  - fallback status codes
- Add backend interface tests for profile creation, model refresh, routing policy persistence, and route resolution.
- Keep deployment integration compatible with existing model-provider plugin behavior.

### Out of Scope for Phase 1

- Full `/v1/chat/completions` proxy.
- Streaming adapter support.
- Live usage/cost aggregation from actual LLM traffic.
- Provider OAuth/subscription login flows.
- Local provider setup flows.
- Multi-tenant server-side billing settlement.

## Shadow Data Contract

Provider profile config:

```ts
interface LlmProviderProfileConfig {
  baseUrl?: string
  apiFormat?: 'openai' | 'anthropic' | 'gemini'
  authType?: 'api_key'
  discoveredAt?: string
  models?: LlmProviderModel[]
}

interface LlmProviderModel {
  id: string
  name?: string
  tags?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}
```

Routing policy:

```ts
interface LlmRoutingPolicy {
  enabled: boolean
  defaultRoute: LlmRouteAssignment
  complexity: Record<'simple' | 'standard' | 'complex' | 'reasoning', LlmRouteAssignment>
  limits: {
    requestsPerMinute: number
    concurrentRequests: number
    monthlyBudgetUsd?: number
  }
  fallback: {
    enabled: boolean
    statusCodes: number[]
  }
  rules: LlmLimitRule[]
}

interface LlmRouteAssignment {
  selector: string
  primary?: string
  fallbacks: string[]
}

interface LlmLimitRule {
  id: string
  metric: 'tokens' | 'cost'
  threshold: number
  period: 'day' | 'month'
  blockRequests: boolean
  enabled: boolean
  triggered: number
}
```

Model references use `profileId/modelId`, which keeps provider profiles and models decoupled while letting templates continue to select by tags such as `fast`, `default`, `vision`, and `reasoning`.

## Shadow Gateway Interface Status

Phase 1 does not yet expose a public LLM proxy token or base URL for third-party clients. The existing user JWT authenticates Cloud management APIs such as provider profile CRUD, model refresh, and routing policy persistence. Provider API keys are encrypted profile secrets and are only decrypted for connection tests, model discovery, and deployment-time OpenClaw config injection.

The intended runtime gateway contract for the next phase is:

- OpenAI-compatible first: `POST /api/cloud-saas/llm/v1/chat/completions` and `GET /api/cloud-saas/llm/v1/models`.
- Client auth: `Authorization: Bearer <shadow-llm-gateway-token>`, generated per user/server/deployment and separate from upstream provider API keys.
- Model selection: explicit `profileId/modelId`, explicit provider model refs where supported, or logical route selectors such as `default`, `fast`, and `reasoning`.
- Provider adaptation: upstream providers can remain OpenAI-compatible, Anthropic Messages, or Gemini, while the first public client interface stays OpenAI-compatible. Anthropic-compatible ingress can be added later under a separate path once proxy behavior is stable.

## Later Phases

## Cross-Check Against Manifest

Current Shadow Phase 1 status after comparing against the Manifest reference:

| Area | Manifest Capability | Shadow Phase 1 Status | Gap |
|------|---------------------|-----------------------|-----|
| Provider vault | Provider credentials, active flag, masked values, API key/subscription/local auth | Partial | API key vault works. Subscription/device-code/OAuth and local provider setup flows are deliberately not exposed in Phase 1. |
| Provider registry | Canonical IDs, aliases, local hints, OpenRouter vendor prefixes | Partial | Cloud plugin catalogs cover OpenAI, Anthropic, Gemini, DeepSeek, Alibaba/Qwen, MiniMax, Moonshot/Kimi, Z.ai, OpenRouter, and core international providers. Full alias metadata, local setup hints, and key-prefix validation remain later work. |
| Model discovery | Provider-native discovery plus fallback catalogs/pricing cache | Partial | OpenAI-compatible, Anthropic, and Gemini discovery are covered. OpenRouter pricing, `models.dev`, Ollama/local tags, and curated fallback catalogs remain later work. |
| Model metadata | Context, cost, quality/capability hints | Partial | Manual metadata and inferred tags are stored. Automated pricing refresh and quality scoring are not implemented. |
| Complexity routing | Default/simple/standard/complex/reasoning routes | Covered for contract | Routing policy is stored and resolvable by selector/tag. It is not yet enforced by a proxy. |
| Fallback | Per-route fallback chain and provider failover | Covered for contract | Fallback order is stored and returned by route resolution. Runtime retry behavior waits for the proxy phase. |
| Specificity routing | Category/header-specific overrides | Missing | Manifest has specificity and header tiers. Shadow does not yet expose these because templates currently use model tags/selectors. |
| Proxy | OpenAI-compatible `/v1/chat/completions`, streaming, provider adapters | Missing | Explicitly out of Phase 1. This is the next major server feature. |
| Limits | RPM, concurrency, budget guards | Contract only | Values are stored in policy. Runtime enforcement and friendly 429 responses wait for the proxy phase. |
| Usage and billing | Token/cost/latency records, dashboards, alerts | Missing | No call ledger or cost dashboard yet. |
| UX | Guided provider setup, routing UI, custom providers | Partial | The Shadow page is simplified for basic BYOK setup. Advanced route/model settings are available but folded away by default. |

Recommended next phases:

1. Implement OpenAI-compatible provider proxy in `apps/server`.
2. Add streaming response adapters and upstream error sanitization.
3. Record LLM call metadata into a usage table.
4. Add pricing refresh from public model catalogs.
5. Add budget notifications and alert rules.
6. Allow deployment templates to bind route selectors directly to saved provider profiles.
