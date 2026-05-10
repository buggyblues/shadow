import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { lookup } from 'mime-types'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

export function createPaidFileHandler(container: AppContainer) {
  const h = new Hono()

  h.get('/paid-files/:fileId', authMiddleware, async (c) => {
    const user = c.get('user')
    const fileId = c.req.param('fileId')
    if (!fileId) return c.json({ ok: false, error: 'PAID_FILE_NOT_FOUND' }, 404)
    const paidFileService = container.resolve('paidFileService')
    return c.json(await paidFileService.getFileState(user.userId, fileId))
  })

  h.post('/paid-files/:fileId/open', authMiddleware, async (c) => {
    const user = c.get('user')
    const fileId = c.req.param('fileId')
    if (!fileId) return c.json({ ok: false, error: 'PAID_FILE_NOT_FOUND' }, 404)
    const paidFileService = container.resolve('paidFileService')
    const opened = await paidFileService.openPaidFile(user.userId, fileId)
    setCookie(c, paidFileGrantCookie(opened.grant.id), opened.grantToken, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: c.req.url.startsWith('https://'),
      path: `/api/paid-files/${fileId}/view/${opened.grant.id}`,
      maxAge: Math.max(
        1,
        Math.floor((new Date(opened.grant.expiresAt).getTime() - Date.now()) / 1000),
      ),
    })
    return c.json(opened, 201)
  })

  h.get('/paid-files/:fileId/view/:grantId', async (c) => {
    const paidFileService = container.resolve('paidFileService')
    const fileId = c.req.param('fileId')
    const grantId = c.req.param('grantId')
    if (!fileId || !grantId) return c.json({ ok: false, error: 'PAID_FILE_GRANT_NOT_FOUND' }, 404)
    const result = await paidFileService.readGrantFile({
      fileId,
      grantId,
      token:
        c.req.header('x-paid-file-grant-token') ??
        getCookie(c, paidFileGrantCookie(grantId)) ??
        c.req.query('token'),
    })
    const contentType = result.file.mime || lookup(result.file.name) || 'application/octet-stream'
    const headers: Record<string, string> = {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${encodeURIComponent(result.file.name)}"`,
      'Content-Type': String(contentType),
      'X-Content-Type-Options': 'nosniff',
    }
    if (/html/i.test(String(contentType))) {
      headers['Content-Security-Policy'] = [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        'img-src data: blob:',
        'media-src data: blob:',
        "font-src 'none'",
        "connect-src 'none'",
        "frame-ancestors 'self'",
      ].join('; ')
    }
    return c.body(new Uint8Array(result.buffer), 200, headers)
  })

  return h
}

function paidFileGrantCookie(grantId: string) {
  return `shadow_paid_file_grant_${grantId.replaceAll('-', '_')}`
}
