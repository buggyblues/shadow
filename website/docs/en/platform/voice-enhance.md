# Voice Enhancement

The voice enhancement service uses AI to clean up and improve voice transcripts.

## Enhance transcript

```
POST /api/voice/enhance
```

Enhance a voice transcript using the configured LLM provider.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transcript` | string | Yes | Raw transcript text |
| `language` | string | No | Language code (default: zh-CN) |
| `options.enableSelfCorrection` | boolean | No | Enable auto-correction |
| `options.enableListFormatting` | boolean | No | Format lists |
| `options.enableFillerRemoval` | boolean | No | Remove filler words |
| `options.enableToneAdjustment` | boolean | No | Adjust tone |
| `options.targetTone` | string | No | Target tone: formal/casual/professional |

:::code-group

```ts [TypeScript]
const result = await client.enhanceVoice({
  transcript: 'Um, so I think we should, like, deploy tomorrow maybe...',
  language: 'en-US',
  options: {
    enableSelfCorrection: true,
    enableFillerRemoval: true,
  },
})
```

```bash [CLI]
shadowob voice-enhance enhance \
  --transcript "Um, so I think we should, like, deploy tomorrow..." \
  --language en-US \
  --no-filler-removal \
  --json
```

:::

---

## Enhance transcript (query params)

```
GET /api/voice/enhance?transcript=...&language=en-US
```

Same as the POST version, but uses query parameters.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `transcript` | string | Yes | Raw transcript text |
| `language` | string | No | Language code |
| `enableSelfCorrection` | boolean | No | Auto-correction |
| `enableListFormatting` | boolean | No | List formatting |
| `enableFillerRemoval` | boolean | No | Filler word removal |
| `enableToneAdjustment` | boolean | No | Tone adjustment |
| `targetTone` | string | No | formal/casual/professional |

:::code-group

```ts [TypeScript]
const result = await client.enhanceVoiceQuery({
  transcript: 'Hello world',
  language: 'en-US',
  enableFillerRemoval: true,
})
```

:::

---

## Get voice config

```
GET /api/voice/config
```

Returns the current voice enhancement configuration (API key redacted).

:::code-group

```ts [TypeScript]
const config = await client.getVoiceConfig()
```

```bash [CLI]
shadowob voice-enhance config --json
```

:::

---

## Update voice config

```
POST /api/voice/config
```

Admin only. Update the LLM configuration for voice enhancement.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | openai / anthropic / alibaba / custom |
| `apiKey` | string | Yes | Provider API key |
| `baseUrl` | string | No | Custom base URL |
| `model` | string | No | Model name |
| `temperature` | number | No | 0-2 |
| `maxTokens` | number | No | Max response tokens |
| `timeout` | number | No | Request timeout (ms) |
| `enabled` | boolean | No | Enable/disable service |

:::code-group

```ts [TypeScript]
await client.updateVoiceConfig({
  provider: 'openai',
  apiKey: 'sk-...',
  model: 'gpt-4',
  enabled: true,
})
```

:::

---

## Health check

```
GET /api/voice/health
```

Admin only. Checks if the voice enhancement service is configured and operational.

:::code-group

```ts [TypeScript]
const health = await client.voiceHealthCheck()
```

:::
