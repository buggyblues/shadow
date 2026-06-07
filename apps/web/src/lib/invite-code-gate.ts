export type InviteRequiredApiError = Error & {
  status: number
  code?: string
  capability?: string
  membership?: unknown
  params?: Record<string, unknown>
}

export type InviteCodeGateRequest = {
  error: InviteRequiredApiError
  path: string
  method: string
}

export type InviteCodeGateHandler = (request: InviteCodeGateRequest) => Promise<unknown>

let handler: InviteCodeGateHandler | null = null
let pendingInviteRequest: Promise<unknown> | null = null

export function setInviteCodeGateHandler(nextHandler: InviteCodeGateHandler | null) {
  handler = nextHandler
  return () => {
    if (handler === nextHandler) {
      handler = null
    }
  }
}

export function resetInviteCodeGateForTests() {
  handler = null
  pendingInviteRequest = null
}

export async function requestInviteCodeForApiError(request: InviteCodeGateRequest) {
  if (!handler || typeof window === 'undefined') {
    throw request.error
  }

  if (!pendingInviteRequest) {
    pendingInviteRequest = handler(request).finally(() => {
      pendingInviteRequest = null
    })
  }

  return pendingInviteRequest
}
