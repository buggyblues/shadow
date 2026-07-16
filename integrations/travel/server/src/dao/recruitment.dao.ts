import type { TravelDataStore } from '../db/database.js'
import type {
  TravelIntent,
  TripJoinApplication,
  TripJoinApplicationStatus,
  TripMember,
  TripRecruitment,
} from '../types.js'

export class RecruitmentDao {
  constructor(private readonly db: TravelDataStore) {}

  listOpen(serverId: string) {
    return this.db.read((state) =>
      state.recruitments
        .filter((item) => item.serverId === serverId && item.status === 'open')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  listForChannelReconciliation() {
    return this.db.read((state) =>
      state.recruitments.filter((item) => item.status === 'open' || Boolean(item.memberChannelId)),
    )
  }

  findByTrip(tripId: string) {
    return this.db.read(
      (state) => state.recruitments.find((item) => item.tripId === tripId) ?? null,
    )
  }

  findRecruitment(recruitmentId: string) {
    return this.db.read(
      (state) => state.recruitments.find((item) => item.id === recruitmentId) ?? null,
    )
  }

  upsertRecruitment(recruitment: TripRecruitment) {
    return this.db.write((state) => {
      const index = state.recruitments.findIndex((item) => item.tripId === recruitment.tripId)
      if (index < 0) state.recruitments.push(recruitment)
      else state.recruitments[index] = recruitment
      return recruitment
    })
  }

  listApplications(recruitmentId: string) {
    return this.db.read((state) =>
      state.joinApplications
        .filter((item) => item.recruitmentId === recruitmentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  listApplicationsForUser(serverId: string, userId: string) {
    return this.db.read((state) =>
      state.joinApplications
        .filter((item) => item.serverId === serverId && item.applicantUserId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  findApplication(applicationId: string) {
    return this.db.read(
      (state) => state.joinApplications.find((item) => item.id === applicationId) ?? null,
    )
  }

  findApplicationForUser(recruitmentId: string, userId: string) {
    return this.db.read(
      (state) =>
        state.joinApplications.find(
          (item) => item.recruitmentId === recruitmentId && item.applicantUserId === userId,
        ) ?? null,
    )
  }

  createApplication(application: TripJoinApplication) {
    return this.db.write((state) => {
      state.joinApplications.push(application)
      return application
    })
  }

  updateApplication(
    applicationId: string,
    updater: (application: TripJoinApplication) => TripJoinApplication,
  ) {
    return this.db.write((state) => {
      const index = state.joinApplications.findIndex((item) => item.id === applicationId)
      if (index < 0) return null
      const current = state.joinApplications[index]
      if (!current) return null
      const next = updater(current)
      state.joinApplications[index] = next
      return next
    })
  }

  approveApplication(
    applicationId: string,
    member: TripMember,
    review: {
      status: Extract<TripJoinApplicationStatus, 'approved'>
      reviewNote?: string
      reviewedByMemberId?: string
      reviewedAt: string
      updatedAt: string
    },
  ) {
    return this.db.write((state) => {
      const index = state.joinApplications.findIndex((item) => item.id === applicationId)
      const current = index >= 0 ? state.joinApplications[index] : undefined
      if (!current) return null
      const existingMember = state.members.find(
        (item) => item.tripId === current.tripId && item.userId === current.applicantUserId,
      )
      const next = { ...current, ...review }
      state.joinApplications[index] = next
      if (!existingMember) state.members.push(member)
      return { application: next, member: existingMember ?? member }
    })
  }

  listTravelIntents(serverId: string) {
    return this.db.read((state) =>
      state.travelIntents
        .filter((item) => item.serverId === serverId && item.status === 'open')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  findTravelIntent(serverId: string, userId: string) {
    return this.db.read(
      (state) =>
        state.travelIntents.find((item) => item.serverId === serverId && item.userId === userId) ??
        null,
    )
  }

  upsertTravelIntent(intent: TravelIntent) {
    return this.db.write((state) => {
      const index = state.travelIntents.findIndex(
        (item) => item.serverId === intent.serverId && item.userId === intent.userId,
      )
      if (index < 0) state.travelIntents.push(intent)
      else state.travelIntents[index] = intent
      return intent
    })
  }
}
