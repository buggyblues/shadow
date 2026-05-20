import { createHash, randomBytes } from 'node:crypto'
import type { ApiTokenDao } from '../dao/api-token.dao'
import type { AccessService } from '../security/access.service'
import type { Actor } from '../security/actor'
import { actorUserId } from '../security/actor'

function generatePatToken(): string {
  return `pat_${randomBytes(32).toString('hex')}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class ApiTokenUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      apiTokenDao: ApiTokenDao
    },
  ) {}

  async createToken(
    actor: Actor,
    input: {
      name: string
      scope: string
      expiresInDays?: number | null
    },
  ) {
    const userId = actorUserId(actor)

    const plainToken = generatePatToken()
    const tokenHash = hashToken(plainToken)

    let expiresAt: Date | null = null
    if (input.expiresInDays) {
      expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    }

    const token = await this.deps.apiTokenDao.create({
      userId,
      tokenHash,
      name: input.name,
      scope: input.scope,
      expiresAt,
    })

    // Return the plaintext token ONLY on creation
    return {
      id: token!.id,
      name: token!.name,
      token: plainToken,
      scope: token!.scope,
      expiresAt: token!.expiresAt,
      createdAt: token!.createdAt,
    }
  }

  async listTokens(actor: Actor) {
    const userId = actorUserId(actor)
    return this.deps.apiTokenDao.findByUserId(userId)
  }

  async deleteToken(actor: Actor, tokenId: string) {
    const userId = actorUserId(actor)

    const existing = await this.deps.apiTokenDao.findById(tokenId, userId)
    if (!existing) return null

    await this.deps.apiTokenDao.deleteByUserIdAndId(userId, tokenId)
    return { ok: true }
  }
}
