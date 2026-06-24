import { signModelProxyToken } from './model-proxy-token'

export const MODEL_PROVIDER_SERVER_SECRET_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_AI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ALIBABA_API_KEY',
  'QWEN_API_KEY',
  'MINIMAX_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_API_KEY',
  'ZAI_API_KEY',
  'ZHIPUAI_API_KEY',
  'GLM_API_KEY',
  'BIGMODEL_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'GROK_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'ANTHROPIC_COMPATIBLE_API_KEY',
  'SHADOWOB_MODEL_PROXY_UPSTREAM_API_KEY',
  'SHADOWOB_MODEL_PROXY_UPSTREAM_ANTHROPIC_API_KEY',
  'MODEL_PROXY_TOKEN_SECRET',
  'JWT_SECRET',
])

const SENSITIVE_SERVER_ENV_PATTERN =
  /(^|_)(API_KEY|AUTH_TOKEN|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|ACCESS_KEY)$/i

const DEFAULT_RUNTIME_SERVER_URL_REQUIREMENT =
  'SHADOWOB_AGENT_SERVER_URL (or pod-reachable SHADOWOB_SERVER_URL)'
const INTERNAL_ONLY_SHADOWOB_RUNTIME_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'host.docker.internal',
  'host.lima.internal',
  'server',
])

export function isOfficialModelProxyEnabled() {
  return process.env.SHADOWOB_MODEL_PROXY_ENABLED !== 'false'
}

function firstNonEmptyEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

export function isInternalOnlyShadowRuntimeUrl(rawUrl?: string) {
  if (!rawUrl?.trim()) return false

  try {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return INTERNAL_ONLY_SHADOWOB_RUNTIME_HOSTS.has(hostname)
  } catch {
    return false
  }
}

export function resolveOfficialModelProxyRuntimeServerUrl(input: { shadowServerUrl?: string }): {
  runtimeServerUrl?: string
  runtimeServerUrlRequirement: string
} {
  const shadowServerUrl = input.shadowServerUrl?.trim()
  if (shadowServerUrl && !isInternalOnlyShadowRuntimeUrl(shadowServerUrl)) {
    return {
      runtimeServerUrl: shadowServerUrl,
      runtimeServerUrlRequirement: DEFAULT_RUNTIME_SERVER_URL_REQUIREMENT,
    }
  }

  return {
    runtimeServerUrl: undefined,
    runtimeServerUrlRequirement: shadowServerUrl
      ? 'SHADOWOB_AGENT_SERVER_URL (current SHADOWOB_SERVER_URL is internal-only)'
      : DEFAULT_RUNTIME_SERVER_URL_REQUIREMENT,
  }
}

export function officialModelProxyMissingConfig(
  runtimeServerUrl?: string,
  runtimeServerUrlRequirement = DEFAULT_RUNTIME_SERVER_URL_REQUIREMENT,
): string[] {
  if (!isOfficialModelProxyEnabled()) return ['SHADOWOB_MODEL_PROXY_ENABLED']

  const missing: string[] = []
  if (!runtimeServerUrl) missing.push(runtimeServerUrlRequirement)
  if (!firstNonEmptyEnv('SHADOWOB_MODEL_PROXY_UPSTREAM_BASE_URL')) {
    missing.push('SHADOWOB_MODEL_PROXY_UPSTREAM_BASE_URL')
  }
  if (!firstNonEmptyEnv('SHADOWOB_MODEL_PROXY_UPSTREAM_API_KEY')) {
    missing.push('SHADOWOB_MODEL_PROXY_UPSTREAM_API_KEY')
  }
  return missing
}

export function assertOfficialModelProxyAvailable(
  runtimeServerUrl?: string,
  runtimeServerUrlRequirement?: string,
) {
  const missing = officialModelProxyMissingConfig(runtimeServerUrl, runtimeServerUrlRequirement)
  if (missing.length === 0) return

  throw Object.assign(
    new Error(`Official model provider is unavailable: missing ${missing.join(', ')}`),
    {
      status: 503,
      code: 'OFFICIAL_MODEL_PROVIDER_UNCONFIGURED',
      missing,
    },
  )
}

export function officialModelProxyModel() {
  return (
    firstNonEmptyEnv('SHADOWOB_MODEL_PROXY_MODEL', 'SHADOWOB_MODEL_PROXY_DEFAULT_MODEL') ??
    'deepseek-v4-flash'
  )
}

export function officialModelProxyBaseUrl(runtimeServerUrl?: string) {
  if (!runtimeServerUrl) return null
  return `${runtimeServerUrl.replace(/\/+$/, '')}/api/ai/v1`
}

export function officialModelProxyAnthropicBaseUrl(runtimeServerUrl?: string) {
  if (!runtimeServerUrl) return null
  return `${runtimeServerUrl.replace(/\/+$/, '')}/api/ai/anthropic`
}

export function officialModelProxyEnvVars(input: {
  runtimeServerUrl?: string
  runtimeServerUrlRequirement?: string
  userId: string
  playId?: string
  templateSlug?: string
  namespace?: string
}) {
  if (
    officialModelProxyMissingConfig(input.runtimeServerUrl, input.runtimeServerUrlRequirement)
      .length > 0
  ) {
    return {}
  }
  const baseUrl = officialModelProxyBaseUrl(input.runtimeServerUrl)
  const anthropicBaseUrl = officialModelProxyAnthropicBaseUrl(input.runtimeServerUrl)
  if (!baseUrl || !anthropicBaseUrl) return {}
  const token = signModelProxyToken({
    userId: input.userId,
    playId: input.playId,
    templateSlug: input.templateSlug,
    namespace: input.namespace,
  })
  const model = officialModelProxyModel()

  return {
    SHADOWOB_MODEL_PROVIDER_ID: 'shadow-official',
    OPENAI_COMPATIBLE_BASE_URL: baseUrl,
    OPENAI_COMPATIBLE_API_KEY: token,
    OPENAI_COMPATIBLE_MODEL_ID: model,
    ANTHROPIC_COMPATIBLE_BASE_URL: anthropicBaseUrl,
    ANTHROPIC_COMPATIBLE_API_KEY: token,
    ANTHROPIC_COMPATIBLE_MODEL_ID: model,
  }
}

export function shouldCopyServerRuntimeEnvKey(key: string) {
  if (MODEL_PROVIDER_SERVER_SECRET_ENV_KEYS.has(key)) return false
  return !SENSITIVE_SERVER_ENV_PATTERN.test(key)
}
