import fsPromises from 'node:fs/promises'
import nodePath from 'node:path'
import { getDataDir } from './paths.js'
import { safeCacheKey } from './state.js'

export type ShadowThreadBinding = {
  accountId: string
  agentId: string
  sessionKey: string
  channelId: string
  threadId?: string
  messageId?: string
  updatedAt: string
}

type ShadowThreadBindingFile = {
  bindings: ShadowThreadBinding[]
}

async function getThreadBindingPath(accountId: string): Promise<string> {
  const dataDir = await getDataDir()
  return nodePath.join(dataDir, 'shadow', `thread-bindings-${safeCacheKey(accountId)}.json`)
}

export async function loadShadowThreadBindings(accountId: string): Promise<ShadowThreadBinding[]> {
  try {
    const raw = await fsPromises.readFile(await getThreadBindingPath(accountId), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ShadowThreadBindingFile>
    if (!Array.isArray(parsed.bindings)) return []
    return parsed.bindings.filter((binding): binding is ShadowThreadBinding => {
      return (
        typeof binding.accountId === 'string' &&
        typeof binding.agentId === 'string' &&
        typeof binding.sessionKey === 'string' &&
        typeof binding.channelId === 'string' &&
        typeof binding.updatedAt === 'string'
      )
    })
  } catch {
    return []
  }
}

export async function saveShadowThreadBindings(
  accountId: string,
  bindings: ShadowThreadBinding[],
): Promise<void> {
  const path = await getThreadBindingPath(accountId)
  await fsPromises.mkdir(nodePath.dirname(path), { recursive: true })
  await fsPromises.writeFile(path, `${JSON.stringify({ bindings }, null, 2)}\n`, 'utf-8')
}

export async function upsertShadowThreadBinding(params: {
  accountId: string
  agentId: string
  sessionKey: string
  channelId: string
  threadId?: string
  messageId?: string
}): Promise<ShadowThreadBinding> {
  const bindings = await loadShadowThreadBindings(params.accountId)
  const key = `${params.agentId}:${params.sessionKey}`
  const next: ShadowThreadBinding = {
    accountId: params.accountId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    channelId: params.channelId,
    ...(params.threadId ? { threadId: params.threadId } : {}),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    updatedAt: new Date().toISOString(),
  }
  const filtered = bindings.filter((binding) => `${binding.agentId}:${binding.sessionKey}` !== key)
  const recent = [next, ...filtered].slice(0, 500)
  await saveShadowThreadBindings(params.accountId, recent)
  return next
}

export function resolveShadowThreadBinding(
  bindings: ShadowThreadBinding[],
  params: { agentId?: string | null; sessionKey?: string | null; threadId?: string | null },
): ShadowThreadBinding | null {
  const agentId = params.agentId?.trim()
  if (params.threadId) {
    return (
      bindings.find(
        (binding) =>
          binding.threadId === params.threadId && (!agentId || binding.agentId === agentId),
      ) ?? null
    )
  }
  const sessionKey = params.sessionKey?.trim()
  if (!agentId || !sessionKey) return null
  return (
    bindings.find((binding) => binding.agentId === agentId && binding.sessionKey === sessionKey) ??
    null
  )
}
