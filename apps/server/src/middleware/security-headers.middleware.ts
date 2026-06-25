import type { Context, Next } from 'hono'
import { cloudExposureHostFromRequestHost } from '../lib/cloud-exposure-gateway'

/**
 * Security HTTP headers middleware.
 *
 * Sets headers recommended by OWASP:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0 (modern browsers ignore this; disables legacy filter)
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Strict-Transport-Security: production only
 */
export async function securityHeadersMiddleware(c: Context, next: Next): Promise<void> {
  await next()

  const isPaidFileGrantView = /^\/api\/paid-files\/[^/]+\/view\/[^/]+$/.test(c.req.path)
  const isCloudExposureGateway =
    c.req.path.startsWith('/api/cloud/exposures/gateway/') ||
    Boolean(cloudExposureHostFromRequestHost(c.req.header('host')))

  c.header('X-Content-Type-Options', 'nosniff')
  if (!isPaidFileGrantView && !isCloudExposureGateway) {
    c.header('X-Frame-Options', 'DENY')
  }
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')

  // HSTS only in production
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}
