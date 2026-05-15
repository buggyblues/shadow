import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const { sign, verify } = jwt

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d'
const JWT_AGENT_EXPIRES_IN = process.env.JWT_AGENT_EXPIRES_IN ?? '30d'
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'shadow'

if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required. ' +
      'Set a strong random secret before starting the server.',
  )
}

export interface JwtPayload {
  userId: string
  email?: string
  username?: string
  typ?: JwtTokenType
  aud?: string
  iss?: string
  jti?: string
  exp?: number
  iat?: number
  scopes?: string[]
}

export type JwtTokenType = 'access' | 'refresh' | 'agent'

function audienceForType(type: JwtTokenType) {
  return `shadow:${type}`
}

function signTypedToken(payload: JwtPayload, type: JwtTokenType, expiresIn: string): string {
  return sign(
    {
      ...payload,
      typ: type,
      aud: audienceForType(type),
      iss: JWT_ISSUER,
      jti: randomUUID(),
    },
    JWT_SECRET as jwt.Secret,
    { expiresIn } as jwt.SignOptions,
  )
}

export function signAccessToken(payload: JwtPayload): string {
  return signTypedToken(payload, 'access', JWT_EXPIRES_IN)
}

export function signRefreshToken(payload: JwtPayload): string {
  return signTypedToken(payload, 'refresh', JWT_REFRESH_EXPIRES_IN)
}

/** Sign a long-lived token for an Agent (bot user) */
export function signAgentToken(payload: JwtPayload): string {
  return signTypedToken(payload, 'agent', JWT_AGENT_EXPIRES_IN)
}

export function verifyToken(
  token: string,
  expectedType?: JwtTokenType | JwtTokenType[],
): JwtPayload {
  const payload = verify(token, JWT_SECRET as jwt.Secret) as JwtPayload
  const expectedTypes = Array.isArray(expectedType)
    ? expectedType
    : expectedType
      ? [expectedType]
      : null

  if (expectedTypes && !payload.typ) {
    throw new Error('Token type is required')
  }
  if (expectedTypes && !expectedTypes.includes(payload.typ as JwtTokenType)) {
    throw new Error('Invalid token type')
  }
  if (payload.typ) {
    if (payload.iss !== JWT_ISSUER) throw new Error('Invalid token issuer')
    if (payload.aud !== audienceForType(payload.typ)) throw new Error('Invalid token audience')
    if (!payload.jti) throw new Error('Token id is required')
  }

  return payload
}
