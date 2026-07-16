import type { TravelDataStore } from '../db/database.js'
import type { TravelAppAccount, TravelAppSession, TravelIdentityLink } from '../types.js'

export class IdentityDao {
  constructor(private readonly db: TravelDataStore) {}

  findAccountByShadowUserId(shadowUserId: string) {
    return this.db.read((state) => {
      const link = state.identityLinks.find((item) => item.shadowUserId === shadowUserId)
      return link ? (state.appAccounts.find((item) => item.id === link.accountId) ?? null) : null
    })
  }

  upsertIdentity(account: TravelAppAccount, link: TravelIdentityLink) {
    return this.db.write((state) => {
      const accountIndex = state.appAccounts.findIndex((item) => item.id === account.id)
      if (accountIndex >= 0) state.appAccounts[accountIndex] = account
      else state.appAccounts.push(account)
      const linkIndex = state.identityLinks.findIndex(
        (item) => item.shadowUserId === link.shadowUserId,
      )
      if (linkIndex >= 0) state.identityLinks[linkIndex] = link
      else state.identityLinks.push(link)
      return { account, link }
    })
  }

  createSession(session: TravelAppSession) {
    return this.db.write((state) => {
      state.appSessions.push(session)
      return session
    })
  }

  findSessionByTokenHash(tokenHash: string) {
    return this.db.read((state) => {
      const session = state.appSessions.find((item) => item.tokenHash === tokenHash)
      if (!session) return null
      const account = state.appAccounts.find((item) => item.id === session.accountId)
      return account ? { session, account } : null
    })
  }

  updateSession(tokenHash: string, patch: Partial<TravelAppSession>) {
    return this.db.write((state) => {
      const session = state.appSessions.find((item) => item.tokenHash === tokenHash)
      if (!session) return null
      Object.assign(session, patch)
      return session
    })
  }

  revokeSession(tokenHash: string) {
    return this.db.write((state) => {
      const session = state.appSessions.find((item) => item.tokenHash === tokenHash)
      if (!session) return false
      session.revokedAt = new Date().toISOString()
      return true
    })
  }
}
