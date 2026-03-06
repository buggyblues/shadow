import jwt from 'jsonwebtoken'

const { sign, verify } = jwt

const JWT_SECRET = process.env.JWT_SECRET ?? 'shadow-dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d'
const JWT_AGENT_EXPIRES_IN = process.env.JWT_AGENT_EXPIRES_IN ?? '365d'

export interface JwtPayload {
  userId: string
  email: string
  username: string
}

export function signAccessToken(payload: JwtPayload): string {
  return sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function signRefreshToken(payload: JwtPayload): string {
  return sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN })
}

/** Sign a long-lived token for an Agent (bot user) */
export function signAgentToken(payload: JwtPayload): string {
  return sign(payload, JWT_SECRET, { expiresIn: JWT_AGENT_EXPIRES_IN })
}

export function verifyToken(token: string): JwtPayload {
  return verify(token, JWT_SECRET) as JwtPayload
}
