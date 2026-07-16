import type { MiddlewareHandler } from 'hono'
import type { AppContainer } from '../container.js'
import type { AuditAction, TravelHonoEnv } from '../types.js'

const mutatingMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function commandTripId(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  const input =
    record.input && typeof record.input === 'object' && !Array.isArray(record.input)
      ? (record.input as Record<string, unknown>)
      : record
  return typeof input.tripId === 'string' ? input.tripId : undefined
}

export function auditSubject(path: string, payload?: unknown) {
  const commandMatch = path.match(/\/\.shadow\/commands\/([^/]+)/)
  if (commandMatch) {
    return {
      tripId: commandTripId(payload),
      subjectType: 'command',
      subjectId: commandMatch[1],
    }
  }

  const match = path.match(/\/api\/trips\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/)
  if (!match) return {}
  return {
    tripId: match[1],
    subjectType: match[2],
    subjectId: match[3],
  }
}

export function auditMiddleware(
  container: AppContainer,
  action: AuditAction = 'api.write',
): MiddlewareHandler<TravelHonoEnv> {
  return async (c, next) => {
    const commandPayload = c.req.path.startsWith('/.shadow/commands/')
      ? await c.req.raw
          .clone()
          .json()
          .catch(() => undefined)
      : undefined
    await next()
    if (!mutatingMethods.has(c.req.method)) return
    if (c.res.status >= 400) return

    const path = c.req.path
    const subject = auditSubject(path, commandPayload)
    await container.auditUseCase
      .recordRequest(c.get('requestContext'), {
        action,
        method: c.req.method,
        path,
        statusCode: c.res.status,
        ...subject,
      })
      .catch(() => undefined)
  }
}
