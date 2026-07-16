export type ConnectorModelProviderStyle = 'openai' | 'anthropic'

export interface ConnectorModelProviderInput {
  id?: string
  label?: string
  baseUrl?: string
  apiKey?: string
  openAIBaseUrl?: string
  openAIApiKey?: string
  anthropicBaseUrl?: string
  anthropicApiKey?: string
  model?: string
}

export interface ConnectorModelProvider {
  id: string
  label: string
  baseUrl?: string
  apiKey?: string
  openAIBaseUrl?: string
  openAIApiKey?: string
  anthropicBaseUrl?: string
  anthropicApiKey?: string
  model: string
}

export interface ConnectorModelProviderEndpoint {
  baseUrl: string
  apiKey: string
}

export function normalizeConnectorModelProvider(
  provider: ConnectorModelProviderInput | undefined | null,
): ConnectorModelProvider | null {
  const baseUrl = provider?.baseUrl?.trim()
  const apiKey = provider?.apiKey?.trim()
  const openAIBaseUrl = provider?.openAIBaseUrl?.trim() || baseUrl
  const openAIApiKey = provider?.openAIApiKey?.trim() || apiKey
  const anthropicBaseUrl = provider?.anthropicBaseUrl?.trim()
  const anthropicApiKey = provider?.anthropicApiKey?.trim()
  const model = provider?.model?.trim()
  if ((!openAIBaseUrl || !openAIApiKey) && (!anthropicBaseUrl || !anthropicApiKey)) return null
  if (!model) return null
  return {
    id: provider?.id?.trim() || 'shadow-official',
    label: provider?.label?.trim() || 'Shadow official LLM proxy',
    baseUrl: openAIBaseUrl || anthropicBaseUrl,
    apiKey: openAIApiKey || anthropicApiKey,
    ...(openAIBaseUrl ? { openAIBaseUrl } : {}),
    ...(openAIApiKey ? { openAIApiKey } : {}),
    ...(anthropicBaseUrl ? { anthropicBaseUrl } : {}),
    ...(anthropicApiKey ? { anthropicApiKey } : {}),
    model,
  }
}

export function ccConnectModelProviderForAgent(
  agentType: string,
  provider: ConnectorModelProviderInput | undefined | null,
): ConnectorModelProvider | null {
  // An active cc-connect provider makes the pinned fork rewrite CODEX_HOME config and auth.
  // Keep Codex on its native configuration regardless of provider data supplied by Shadow.
  if (agentType.trim().toLowerCase() === 'codex') return null
  return normalizeConnectorModelProvider(provider)
}

export function connectorModelProviderEndpoint(
  provider: ConnectorModelProvider | null | undefined,
  style: ConnectorModelProviderStyle,
): ConnectorModelProviderEndpoint | null {
  if (!provider) return null
  const baseUrl =
    style === 'anthropic'
      ? provider.anthropicBaseUrl?.trim() || provider.baseUrl?.trim()
      : provider.openAIBaseUrl?.trim() || provider.baseUrl?.trim()
  const apiKey =
    style === 'anthropic'
      ? provider.anthropicApiKey?.trim() || provider.apiKey?.trim()
      : provider.openAIApiKey?.trim() || provider.apiKey?.trim()
  return baseUrl && apiKey ? { baseUrl, apiKey } : null
}

export function ccConnectModelRef(agentType: string, providerId: string, model: string): string {
  if (agentType !== 'opencode') return model
  return model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}`
}
