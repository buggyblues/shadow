# Model Provider Plugin

Model Provider auto-discovers available model credentials and injects matching OpenClaw model provider entries. It keeps provider setup out of individual templates, so a Buddy can use saved provider profiles, secret groups, or deployment environment variables.

## Configuration Keys

This plugin normally does not ask users to fill a long provider form. It detects configured provider credentials from the deployment environment.

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `OPENAI_COMPATIBLE_API_KEY` | No | Yes | Optional custom OpenAI-compatible API key. |
| `OPENAI_COMPATIBLE_BASE_URL` | No | No | Base URL for a custom OpenAI-compatible provider. |
| `OPENAI_COMPATIBLE_MODEL_ID` | No | No | Default model ID for the custom provider. |
| `SHADOWOB_PROVIDER_PROFILE_MODELS_JSON` | No | No | Optional model catalog override from provider profiles. |

## Auto-detected Provider Keys

The plugin can detect common provider keys such as `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `ALIBABA_API_KEY`, `QWEN_API_KEY`, `MINIMAX_API_KEY`, `MOONSHOT_API_KEY`, `KIMI_API_KEY`, `ZAI_API_KEY`, `ZHIPUAI_API_KEY`, `GLM_API_KEY`, `BIGMODEL_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, and `GROK_API_KEY`.

## Setup

1. Configure a provider profile, secret group, or deployment environment variable for at least one supported provider.
2. Add `model-provider` to the template or agent `use` list.
3. Optionally select a model tag or model ID with the plugin options `selector`, `tag`, or `model`.
4. Deploy the Buddy.
5. Check the generated OpenClaw config to confirm that one primary model and fallbacks were selected.

## Runtime Assets

- Adds provider catalogs for Anthropic, OpenAI, Gemini, DeepSeek, Qwen, MiniMax, Moonshot, Z.ai, OpenRouter, Grok, and custom OpenAI-compatible endpoints.
- When an OpenAI-compatible endpoint is explicitly present, it is selected before ambient direct-provider keys. This keeps official proxy deployments from falling back through stale personal provider keys.
- Emits OpenClaw `models.providers` and agent default model selection when credentials are detected.

## References

- [OpenAI API keys](https://platform.openai.com/api-keys)
- [Anthropic Console](https://console.anthropic.com/)
- [OpenRouter keys](https://openrouter.ai/settings/keys)
