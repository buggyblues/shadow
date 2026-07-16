import type { TravelDataStore } from '../db/database.js'
import type { AuditLog } from '../types.js'

export class AuditDao {
  constructor(private readonly db: TravelDataStore) {}

  listAuditLogs(tripId: string, limit = 200) {
    return this.db.read((state) =>
      state.auditLogs
        .filter((log) => log.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    )
  }

  createAuditLog(log: AuditLog) {
    return this.db.write((state) => {
      state.auditLogs.push(log)
      if (state.auditLogs.length > 10000) {
        state.auditLogs = state.auditLogs
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10000)
      }
      return log
    })
  }
}
