# Official Model Proxy

Shadow exposes an OpenAI-compatible model proxy for Cloud runtimes and deployed Buddies. It lets new
users start without bringing their own model provider while keeping the official upstream key on the
Space side.

## Endpoints

All requests require a Shadow access token or a limited `smp_...` model proxy token.

```http
GET /api/ai/v1/models
GET /api/ai/v1/billing
POST /api/ai/v1/chat/completions
```

The chat endpoint follows the OpenAI chat completions shape:

```ts
const completion = await fetch('/api/ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Say hello' }],
  }),
})
```

## Billing

The default official provider is configured from environment variables. The default model is
`deepseek-v4-flash`, with `https://api.deepseek.com` as the example and compose default base URL.
Both the base URL and model can be changed without code changes.

Default DeepSeek-style pricing:

| Usage bucket | Price |
|--------------|-------|
| Input tokens, cache hit | 0.02 CNY / 1M tokens = 0.4 Shrimp Coins / 1M tokens |
| Input tokens, cache miss | 1 CNY / 1M tokens = 20 Shrimp Coins / 1M tokens |
| Output tokens | 2 CNY / 1M tokens = 40 Shrimp Coins / 1M tokens |

Shadow converts CNY pricing to Shrimp Coins with `1 CNY = 20 Shrimp Coins` by default. Wallet
balances remain integer coins, so the proxy accumulates micro-Shrimp usage and only commits whole
coins when the pending usage reaches an integer.

## Insufficient Balance

If the wallet cannot cover an official model request, Shadow returns an OpenAI-compatible response
with a `shadow:wallet-recharge` marker instead of exposing an upstream provider error. Shadow clients
render that marker as a recharge card in the chat area.

## Security

- Official upstream API keys stay in the Space environment.
- Cloud templates and Pods receive only limited model proxy tokens.
- Provider errors are normalized before they reach clients, so upstream account or quota details are not exposed.
- User-owned provider profiles are separate from the official proxy and are encrypted through Cloud provider settings.

---

- [Authentication](/platform/authentication) — tokens and membership
- [SDKs](/platform/sdks) — SDK examples
- [Cloud Computers](./cloud-computers) — community cloud runtime objects that can use the proxy
