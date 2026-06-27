import { createHmac, timingSafeEqual } from 'node:crypto'

const DESKTOP_SESSION_TTL_SECONDS = Number(
  process.env.CLOUD_COMPUTER_DESKTOP_SESSION_TTL_SECONDS ?? 300,
)
const K8S_SERVICE_NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

export type CloudComputerDesktopSessionClaims = {
  kind?: 'desktop'
  deploymentId: string
  userId: string
  namespace: string
  serviceName: string
  targetPort: number
  exp: number
}

function signingSecret() {
  const secret = process.env.CLOUD_COMPUTER_DESKTOP_SESSION_SECRET ?? process.env.JWT_SECRET
  if (!secret) {
    throw Object.assign(new Error('desktop session signing secret is not configured'), {
      status: 500,
    })
  }
  return secret
}

export function resolveCloudComputerDesktopTarget() {
  const serviceName = process.env.CLOUD_COMPUTER_DESKTOP_SERVICE?.trim() || 'cloud-computer-desktop'
  const targetPort = Number(process.env.CLOUD_COMPUTER_DESKTOP_VNC_PORT ?? 5900)
  if (!K8S_SERVICE_NAME_RE.test(serviceName)) {
    throw Object.assign(new Error('Invalid desktop service name'), { status: 500 })
  }
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw Object.assign(new Error('Invalid desktop VNC port'), { status: 500 })
  }
  return { serviceName, targetPort }
}

export function signCloudComputerDesktopSession(
  input: Omit<CloudComputerDesktopSessionClaims, 'exp' | 'kind'>,
) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + Math.max(30, Math.min(DESKTOP_SESSION_TTL_SECONDS, 15 * 60))
  const payload = { ...input, kind: 'desktop' as const, exp }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', signingSecret()).update(encoded).digest('base64url')
  return {
    token: `${encoded}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    claims: payload,
  }
}

export function verifyCloudComputerDesktopSession(token: string) {
  const [encoded, sig] = token.split('.')
  if (!encoded || !sig)
    throw Object.assign(new Error('Invalid desktop session token'), { status: 401 })

  const expected = createHmac('sha256', signingSecret()).update(encoded).digest()
  const actual = Buffer.from(sig, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('Invalid desktop session token'), { status: 401 })
  }

  const claims = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as Partial<CloudComputerDesktopSessionClaims>
  if (
    (claims.kind ?? 'desktop') !== 'desktop' ||
    !claims.deploymentId ||
    !claims.userId ||
    !claims.namespace ||
    !claims.serviceName ||
    !claims.targetPort ||
    !claims.exp ||
    Date.now() / 1000 >= claims.exp
  ) {
    throw Object.assign(new Error('Expired desktop session token'), { status: 401 })
  }
  if (!K8S_SERVICE_NAME_RE.test(claims.serviceName)) {
    throw Object.assign(new Error('Invalid desktop target'), { status: 401 })
  }
  return claims as CloudComputerDesktopSessionClaims
}
