import { and, eq } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { db } from '../db'
import { members } from '../db/schema'

type RequiredRole = 'owner' | 'admin' | 'member'

const ROLE_HIERARCHY: Record<RequiredRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
}

export function requireRole(requiredRole: RequiredRole) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const user = c.get('user')
    const serverId = c.req.param('serverId') ?? c.req.param('id')

    if (!serverId) {
      return c.json({ ok: false, error: 'Server ID is required' }, 400)
    }

    const member = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, user.userId), eq(members.serverId, serverId)))
      .limit(1)

    if (member.length === 0) {
      return c.json({ ok: false, error: 'Not a member of this server' }, 403)
    }

    const userRole = member[0]!.role as RequiredRole
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
      return c.json({ ok: false, error: `Requires ${requiredRole} role or higher` }, 403)
    }

    await next()
  }
}
