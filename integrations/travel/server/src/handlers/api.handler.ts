import { Hono } from 'hono'
import type { AppContainer } from '../container.js'
import { badRequest } from '../lib/errors.js'
import { ok } from '../lib/json.js'
import { auditMiddleware } from '../middleware/audit.middleware.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import type {
  RequestContext,
  TravelCategoryDomain,
  TravelContext,
  TravelHonoEnv,
} from '../types.js'
import { parseBooleanQuery, parseJsonBody } from '../validators/http.js'
import {
  acceptInviteSchema,
  applyPackingTemplateSchema,
  applyToTripSchema,
  bindTripBuddySchema,
  budgetAnalyticsSchema,
  bulkCreatePlacesSchema,
  bulkImportPackingSchema,
  confirmImportJobBatchSchema,
  confirmImportJobSchema,
  convertExpensesSchema,
  createAssignmentSchema,
  createAttachmentSchema,
  createAutomationTaskSchema,
  createBackupSchema,
  createCategorySchema,
  createCommunityPollSchema,
  createDaySchema,
  createDecisionRefSchema,
  createDiscussionRefSchema,
  createEmergencyReportSchema,
  createExpenseSchema,
  createGuestSchema,
  createInviteSchema,
  createMemberSchema,
  createNotificationSchema,
  createPackingBagSchema,
  createPackingItemSchema,
  createPackingTemplateSchema,
  createPlaceSchema,
  createReservationSchema,
  createSettlementRecordSchema,
  createShareLinkSchema,
  createTagSchema,
  createTodoSchema,
  createTripSchema,
  dispatchBuddyPlanSchema,
  ensureCommunityChannelSchema,
  exportRouteSchema,
  importAirtrailFlightsSchema,
  importBookingSchema,
  importPlacesSchema,
  linkTripPhotoSchema,
  markNotificationReadSchema,
  optimizeRouteSchema,
  packingSuggestionsSchema,
  proposeBuddyPlanSchema,
  reorderAssignmentsSchema,
  reorderIdsSchema,
  reorderPackingItemsSchema,
  reorderTodosSchema,
  reservationStatusSchema,
  reviewBuddyPlanSchema,
  reviewTripApplicationSchema,
  savePackingTemplateSchema,
  saveProviderPlaceSchema,
  saveTransitPlanSchema,
  setCategoryAssigneesSchema,
  setExpenseMembersSchema,
  settlementRecordStatusSchema,
  settlementTransferPaidSchema,
  shareTripToCommunitySchema,
  startDiscussionSchema,
  syncMutationsSchema,
  toggleExpensePaidSchema,
  toggleTodoSchema,
  updateAssignmentSchema,
  updateCategorySchema,
  updateDaySchema,
  updateExpenseSchema,
  updateGuestSchema,
  updateMemberSchema,
  updatePackingBagSchema,
  updatePackingItemSchema,
  updatePlaceSchema,
  updateReservationSchema,
  updateTagSchema,
  updateTodoSchema,
  updateTripSchema,
  updateTripSettingsSchema,
  upsertClientStateSchema,
  upsertTravelIntentSchema,
  upsertTripRecruitmentSchema,
} from '../validators/travel.schema.js'
import { createProviderApiHandler } from './provider-api.handler.js'

function requestContext(c: TravelContext): RequestContext {
  return c.get('requestContext')
}

const categoryDomains = new Set(['place', 'todo', 'packing', 'expense'])

function parseCategoryDomain(value: string | undefined): TravelCategoryDomain | undefined {
  if (!value) return undefined
  if (!categoryDomains.has(value)) throw badRequest('Invalid category domain')
  return value as TravelCategoryDomain
}

function externalHash(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url').slice(0, 120)
}

export function createApiHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()
  app.use('*', authMiddleware)
  app.use('*', auditMiddleware(container))

  app.get('/bootstrap', (c) =>
    c.json(
      ok({
        appKey: 'travel',
        serverId: requestContext(c).serverId,
        actor: requestContext(c).actor,
        auth: requestContext(c).auth,
        launch: requestContext(c).launch,
      }),
    ),
  )

  app.get('/client-state/:key', async (c) => {
    const scope = c.req.query('scope')
    if (scope !== 'global' && scope !== 'trip' && scope !== 'user') {
      throw badRequest('Invalid client state scope')
    }
    const data = await container.clientStateUseCase.get(requestContext(c), {
      key: c.req.param('key'),
      scope,
      tripId: c.req.query('tripId'),
    })
    return c.json(ok(data))
  })

  app.put('/client-state/:key', async (c) => {
    const input = await parseJsonBody(c, upsertClientStateSchema)
    const data = await container.clientStateUseCase.upsert(requestContext(c), {
      expectedRevision: input.expectedRevision,
      key: c.req.param('key'),
      scope: input.scope,
      tripId: input.tripId,
      value: input.value,
    })
    return c.json(ok(data))
  })

  app.get('/emergency-reports', async (c) => {
    const data = await container.emergencyReportUseCase.list(
      requestContext(c),
      parseBooleanQuery(c.req.query('includeEnded')) ?? true,
    )
    return c.json(ok(data))
  })

  app.post('/emergency-reports', async (c) => {
    const input = await parseJsonBody(c, createEmergencyReportSchema)
    const data = await container.emergencyReportUseCase.create(requestContext(c), input)
    return c.json(ok(data))
  })

  app.post('/emergency-reports/:reportId/end', async (c) => {
    const data = await container.emergencyReportUseCase.end(
      requestContext(c),
      c.req.param('reportId'),
    )
    return c.json(ok(data))
  })

  app.post('/emergency-reports/:reportId/vote-remove', async (c) => {
    const data = await container.emergencyReportUseCase.vote(
      requestContext(c),
      c.req.param('reportId'),
    )
    return c.json(ok(data))
  })

  app.get('/shadow/inboxes', async (c) => {
    const data = await container.communityUseCase.listInboxes(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/shadow/members', async (c) => {
    const data = await container.shadowGateway.listHumanMembers(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/shadow/channels', async (c) => {
    const data = await container.shadowGateway.listChannels(requestContext(c))
    return c.json(ok(data))
  })

  app.post('/shadow/channels/ensure', async (c) => {
    const input = await parseJsonBody(c, ensureCommunityChannelSchema)
    const data = await container.communityUseCase.ensureChannel(requestContext(c), input)
    return c.json(ok(data))
  })

  app.post('/shadow/polls', async (c) => {
    const input = await parseJsonBody(c, createCommunityPollSchema)
    const data = await container.communityUseCase.createPoll(requestContext(c), input)
    return c.json(ok(data))
  })

  app.get('/tags', async (c) => {
    const data = await container.metadataUseCase.listTags(requestContext(c))
    return c.json(ok(data))
  })

  app.post('/tags', async (c) => {
    const input = await parseJsonBody(c, createTagSchema)
    const data = await container.metadataUseCase.createTag(requestContext(c), input)
    return c.json(ok(data))
  })

  app.patch('/tags/:tagId', async (c) => {
    const input = await parseJsonBody(c, updateTagSchema)
    const data = await container.metadataUseCase.updateTag(
      requestContext(c),
      c.req.param('tagId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/tags/:tagId', async (c) => {
    const data = await container.metadataUseCase.deleteTag(requestContext(c), c.req.param('tagId'))
    return c.json(ok(data))
  })

  app.get('/categories', async (c) => {
    const data = await container.metadataUseCase.listCategories(
      requestContext(c),
      parseCategoryDomain(c.req.query('domain')),
    )
    return c.json(ok(data))
  })

  app.post('/categories', async (c) => {
    const input = await parseJsonBody(c, createCategorySchema)
    const data = await container.metadataUseCase.createCategory(requestContext(c), input)
    return c.json(ok(data))
  })

  app.patch('/categories/:categoryId', async (c) => {
    const input = await parseJsonBody(c, updateCategorySchema)
    const data = await container.metadataUseCase.updateCategory(
      requestContext(c),
      c.req.param('categoryId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/categories/:categoryId', async (c) => {
    const data = await container.metadataUseCase.deleteCategory(
      requestContext(c),
      c.req.param('categoryId'),
    )
    return c.json(ok(data))
  })

  app.post('/invites/accept', async (c) => {
    const input = await parseJsonBody(c, acceptInviteSchema)
    const data = await container.tripUseCase.acceptInvite(requestContext(c), input)
    return c.json(ok(data))
  })

  app.route('/', createProviderApiHandler(container))
  app.get('/notifications', async (c) => {
    const data = await container.notificationUseCase.listNotifications(requestContext(c), {
      tripId: c.req.query('tripId'),
      unreadOnly: parseBooleanQuery(c.req.query('unreadOnly')),
    })
    return c.json(ok(data))
  })

  app.post('/notifications', async (c) => {
    const input = await parseJsonBody(c, createNotificationSchema)
    const data = await container.notificationUseCase.createNotification(requestContext(c), input)
    return c.json(ok(data))
  })

  app.post('/notifications/:notificationId/read', async (c) => {
    const input = await parseJsonBody(c, markNotificationReadSchema)
    const data = await container.notificationUseCase.markRead(
      requestContext(c),
      c.req.param('notificationId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/notifications/mark-all-read', async (c) => {
    const input = await parseJsonBody(c, markNotificationReadSchema.partial())
    const data = await container.notificationUseCase.markAllRead(requestContext(c), {
      tripId: c.req.query('tripId'),
      memberId: input.memberId,
    })
    return c.json(ok(data))
  })

  app.get('/packing/templates', async (c) => {
    const data = await container.packingUseCase.listTemplates(requestContext(c))
    return c.json(ok(data))
  })

  app.post('/packing/templates', async (c) => {
    const input = await parseJsonBody(c, createPackingTemplateSchema)
    const data = await container.packingUseCase.createTemplate(requestContext(c), input)
    return c.json(ok(data))
  })

  app.delete('/packing/templates/:templateId', async (c) => {
    const data = await container.packingUseCase.deleteTemplate(
      requestContext(c),
      c.req.param('templateId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips', async (c) => {
    const data = await container.tripUseCase.listTrips(requestContext(c), {
      includeArchived: parseBooleanQuery(c.req.query('includeArchived')),
    })
    return c.json(ok(data))
  })

  app.get('/recruitments', async (c) => {
    const data = await container.recruitmentUseCase.listOpen(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/travel-intents', async (c) => {
    const data = await container.recruitmentUseCase.listTravelIntents(requestContext(c))
    return c.json(ok(data))
  })

  app.put('/travel-intents/me', async (c) => {
    const input = await parseJsonBody(c, upsertTravelIntentSchema)
    const data = await container.recruitmentUseCase.upsertTravelIntent(requestContext(c), input)
    return c.json(ok(data))
  })

  app.delete('/travel-intents/me', async (c) => {
    const data = await container.recruitmentUseCase.closeTravelIntent(requestContext(c))
    return c.json(ok(data))
  })

  app.post('/recruitments/:recruitmentId/applications', async (c) => {
    const input = await parseJsonBody(c, applyToTripSchema)
    const data = await container.recruitmentUseCase.apply(
      requestContext(c),
      c.req.param('recruitmentId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/applications/:applicationId/withdraw', async (c) => {
    const data = await container.recruitmentUseCase.withdraw(
      requestContext(c),
      c.req.param('applicationId'),
    )
    return c.json(ok(data))
  })

  app.patch('/applications/:applicationId', async (c) => {
    const input = await parseJsonBody(c, applyToTripSchema)
    const data = await container.recruitmentUseCase.updateApplication(
      requestContext(c),
      c.req.param('applicationId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips', async (c) => {
    const input = await parseJsonBody(c, createTripSchema)
    const data = await container.tripUseCase.createTrip(requestContext(c), input)
    return c.json(ok(data))
  })

  app.get('/trips/:tripId', async (c) => {
    const data = await container.tripUseCase.getBundle(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/recruitment', async (c) => {
    const data = await container.recruitmentUseCase.getForTrip(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.put('/trips/:tripId/recruitment', async (c) => {
    const input = await parseJsonBody(c, upsertTripRecruitmentSchema)
    const data = await container.recruitmentUseCase.upsert(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/applications/:applicationId/review', async (c) => {
    const input = await parseJsonBody(c, reviewTripApplicationSchema)
    const data = await container.recruitmentUseCase.review(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('applicationId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId', async (c) => {
    const input = await parseJsonBody(c, updateTripSchema)
    const data = await container.tripUseCase.updateTrip(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId', async (c) => {
    const data = await container.tripUseCase.deleteTrip(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/archive', async (c) => {
    const data = await container.tripUseCase.archiveTrip(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/copy', async (c) => {
    const data = await container.tripUseCase.copyTrip(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/dashboard', async (c) => {
    const data = await container.tripUseCase.dashboard(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/context-pack', async (c) => {
    const data = await container.tripUseCase.contextPack(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/sync/manifest', async (c) => {
    const data = await container.syncUseCase.manifest(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/sync/mutations', async (c) => {
    const status = c.req.query('status')
    const data = await container.syncUseCase.listMutations(
      requestContext(c),
      c.req.param('tripId'),
      status === 'queued' || status === 'applied' || status === 'conflict' || status === 'failed'
        ? status
        : undefined,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/sync/mutations', async (c) => {
    const input = await parseJsonBody(c, syncMutationsSchema)
    const data = await container.syncUseCase.applyMutations(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/weather/refresh', async (c) => {
    const data = await container.planningUseCase.refreshTripWeather(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/route-segments', async (c) => {
    const data = await container.planningUseCase.listRouteSegments(
      requestContext(c),
      c.req.param('tripId'),
      c.req.query('dayId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/routes/optimize', async (c) => {
    const input = await parseJsonBody(c, optimizeRouteSchema)
    const data = await container.planningUseCase.optimizeRoute(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/routes/export', async (c) => {
    const input = await parseJsonBody(c, exportRouteSchema)
    const data = await container.planningUseCase.exportRoute(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/audit-logs', async (c) => {
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    const data = await container.auditUseCase.listTripAuditLogs(
      requestContext(c),
      c.req.param('tripId'),
      Number.isFinite(limit) ? limit : undefined,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/members', async (c) => {
    const data = await container.tripUseCase.listMembers(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/members', async (c) => {
    const input = await parseJsonBody(c, createMemberSchema)
    const data = await container.tripUseCase.addMember(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/members/:memberId', async (c) => {
    const input = await parseJsonBody(c, updateMemberSchema)
    const data = await container.tripUseCase.updateMember(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('memberId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/members/:memberId', async (c) => {
    const data = await container.tripUseCase.removeMember(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('memberId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/members/:memberId/transfer-owner', async (c) => {
    const data = await container.tripUseCase.transferOwner(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('memberId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/guests', async (c) => {
    const data = await container.tripUseCase.listGuests(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/guests', async (c) => {
    const input = await parseJsonBody(c, createGuestSchema)
    const data = await container.tripUseCase.createGuest(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/guests/:guestId', async (c) => {
    const input = await parseJsonBody(c, updateGuestSchema)
    const data = await container.tripUseCase.updateGuest(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('guestId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/guests/:guestId', async (c) => {
    const data = await container.tripUseCase.deleteGuest(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('guestId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/invites', async (c) => {
    const data = await container.tripUseCase.listInvites(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/invites', async (c) => {
    const input = await parseJsonBody(c, createInviteSchema)
    const data = await container.tripUseCase.createInvite(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/invites/:inviteId/revoke', async (c) => {
    const data = await container.tripUseCase.revokeInvite(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('inviteId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/settings', async (c) => {
    const data = await container.settingsUseCase.getTripSettings(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/settings', async (c) => {
    const input = await parseJsonBody(c, updateTripSettingsSchema)
    const data = await container.settingsUseCase.updateTripSettings(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/backups', async (c) => {
    const data = await container.backupUseCase.listTripBackups(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/backups', async (c) => {
    const input = await parseJsonBody(c, createBackupSchema.partial())
    const data = await container.backupUseCase.createTripBackup(
      requestContext(c),
      c.req.param('tripId'),
      { ...input, kind: 'trip' },
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/export', async (c) => {
    const data = await container.backupUseCase.exportTrip(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/export/json', async (c) => {
    const data = await container.backupUseCase.exportTrip(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/export.ics', async (c) => {
    const data = await container.tripUseCase.exportIcs(requestContext(c), c.req.param('tripId'))
    return c.body(data, 200, {
      'content-type': 'text/calendar; charset=utf-8',
    })
  })

  app.post('/trips/:tripId/backups/:backupId/restore', async (c) => {
    const data = await container.backupUseCase.restoreTripBackup(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('backupId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/days', async (c) => {
    const data = await container.planningUseCase.listDays(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/days', async (c) => {
    const input = await parseJsonBody(c, createDaySchema)
    const data = await container.planningUseCase.createDay(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/days/:dayId', async (c) => {
    const input = await parseJsonBody(c, updateDaySchema)
    const data = await container.planningUseCase.updateDay(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('dayId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/days/:dayId', async (c) => {
    const data = await container.planningUseCase.deleteDay(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('dayId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/places', async (c) => {
    const data = await container.planningUseCase.listPlaces(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/places', async (c) => {
    const input = await parseJsonBody(c, createPlaceSchema)
    const data = await container.planningUseCase.createPlace(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/places/bulk', async (c) => {
    const input = await parseJsonBody(c, bulkCreatePlacesSchema)
    const data = await container.planningUseCase.bulkCreatePlaces(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/places/import', async (c) => {
    const input = await parseJsonBody(c, importPlacesSchema)
    const data = await container.planningUseCase.importPlaces(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/places/provider-save', async (c) => {
    const input = await parseJsonBody(c, saveProviderPlaceSchema)
    const data = await container.planningUseCase.saveProviderPlace(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/places/:placeId', async (c) => {
    const input = await parseJsonBody(c, updatePlaceSchema)
    const data = await container.planningUseCase.updatePlace(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('placeId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/places/:placeId', async (c) => {
    const data = await container.planningUseCase.deletePlace(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('placeId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/assignments', async (c) => {
    const data = await container.planningUseCase.listAssignments(
      requestContext(c),
      c.req.param('tripId'),
      c.req.query('dayId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/assignments', async (c) => {
    const input = await parseJsonBody(c, createAssignmentSchema)
    const data = await container.planningUseCase.createAssignment(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/days/:dayId/assignments', async (c) => {
    const input = await parseJsonBody(c, createAssignmentSchema)
    const data = await container.planningUseCase.createAssignment(
      requestContext(c),
      c.req.param('tripId'),
      {
        ...input,
        dayId: c.req.param('dayId'),
      },
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/assignments/reorder', async (c) => {
    const input = await parseJsonBody(c, reorderAssignmentsSchema)
    const data = await container.planningUseCase.reorderAssignments(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/assignments/:assignmentId', async (c) => {
    const input = await parseJsonBody(c, updateAssignmentSchema)
    const data = await container.planningUseCase.updateAssignment(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('assignmentId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/assignments/:assignmentId', async (c) => {
    const data = await container.planningUseCase.deleteAssignment(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('assignmentId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/reservations', async (c) => {
    const data = await container.bookingUseCase.listReservations(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/reservations', async (c) => {
    const input = await parseJsonBody(c, createReservationSchema)
    const data = await container.bookingUseCase.createReservation(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/reservations/:reservationId', async (c) => {
    const input = await parseJsonBody(c, updateReservationSchema)
    const data = await container.bookingUseCase.updateReservation(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('reservationId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/reservations/:reservationId', async (c) => {
    const data = await container.bookingUseCase.deleteReservation(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('reservationId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/reservations/:reservationId/status', async (c) => {
    const input = await parseJsonBody(c, reservationStatusSchema)
    const data = await container.bookingUseCase.setReservationStatus(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('reservationId'),
      input.status,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/reservations/reorder', async (c) => {
    const input = await parseJsonBody(c, reorderIdsSchema)
    const data = await container.bookingUseCase.reorderReservations(
      requestContext(c),
      c.req.param('tripId'),
      input.orderedIds,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/import-jobs', async (c) => {
    const data = await container.bookingUseCase.listImportJobs(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/import-booking', async (c) => {
    const input = await parseJsonBody(c, importBookingSchema)
    const data = await container.bookingUseCase.importBooking(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/reservations/import/airtrail', async (c) => {
    const input = await parseJsonBody(c, importAirtrailFlightsSchema)
    const ctx = requestContext(c)
    const source =
      input.flights.length > 0
        ? input.flights
        : (await container.providerUseCase.airtrailFlights(ctx)).flights
    const ids = new Set(input.flightIds.map((id) => String(id)))
    const selected = ids.size > 0 ? source.filter((flight) => ids.has(String(flight.id))) : source
    const reservations = []
    for (const flight of selected) {
      const flightId = flight.id === undefined || flight.id === null ? undefined : String(flight.id)
      const parsed = createReservationSchema.safeParse({
        kind: 'flight',
        title: typeof flight.title === 'string' ? flight.title : 'Flight',
        provider: typeof flight.provider === 'string' ? flight.provider : 'External flight source',
        startAt: typeof flight.startAt === 'string' ? flight.startAt : undefined,
        endAt: typeof flight.endAt === 'string' ? flight.endAt : undefined,
        passengerNames: Array.isArray(flight.passengerNames) ? flight.passengerNames : [],
        transportDetails:
          flight.transportDetails && typeof flight.transportDetails === 'object'
            ? flight.transportDetails
            : undefined,
        rawImport: flight,
        externalSource: 'airtrail',
        externalId: flightId,
        externalOwnerUserId: ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? undefined,
        externalHash: externalHash(flight),
        externalSyncedAt: new Date().toISOString(),
        syncEnabled: Boolean(flightId),
        createExpense: input.createExpense,
      })
      if (!parsed.success) continue
      reservations.push(
        await container.bookingUseCase.createReservation(
          requestContext(c),
          c.req.param('tripId'),
          parsed.data,
        ),
      )
    }
    return c.json(ok({ reservations }))
  })

  app.post('/trips/:tripId/integrations/airtrail/sync', async (c) => {
    const ctx = requestContext(c)
    const flights = (await container.providerUseCase.airtrailFlights(ctx)).flights
    const data = await container.bookingUseCase.syncAirtrailFlights(
      ctx,
      c.req.param('tripId'),
      flights,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/transit/save', async (c) => {
    const input = await parseJsonBody(c, saveTransitPlanSchema)
    const data = await container.bookingUseCase.saveTransitPlan(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/import-jobs/:jobId/confirm', async (c) => {
    const input = await parseJsonBody(c, confirmImportJobSchema)
    const data = await container.bookingUseCase.confirmImportJob(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('jobId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/import-jobs/:jobId/confirm-batch', async (c) => {
    const input = await parseJsonBody(c, confirmImportJobBatchSchema)
    const data = await container.bookingUseCase.confirmImportJobBatch(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('jobId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/expenses', async (c) => {
    const data = await container.budgetUseCase.listExpenses(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/expenses/analytics', async (c) => {
    const result = budgetAnalyticsSchema.safeParse({
      targetCurrency: c.req.query('targetCurrency'),
      date: c.req.query('date'),
      includeWaived: parseBooleanQuery(c.req.query('includeWaived')),
    })
    if (!result.success) throw badRequest('Query validation failed', result.error.flatten())
    const data = await container.budgetUseCase.analytics(
      requestContext(c),
      c.req.param('tripId'),
      result.data,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/expenses/settlement', async (c) => {
    const data = await container.budgetUseCase.settlement(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/convert', async (c) => {
    const input = await parseJsonBody(c, convertExpensesSchema)
    const data = await container.budgetUseCase.convertTotals(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/expenses/settlement-records', async (c) => {
    const data = await container.budgetUseCase.listSettlementRecords(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/settlement-records', async (c) => {
    const input = await parseJsonBody(c, createSettlementRecordSchema)
    const data = await container.budgetUseCase.createSettlementRecords(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/settlement-records/:recordId/confirm', async (c) => {
    const input = await parseJsonBody(c, settlementRecordStatusSchema)
    const data = await container.budgetUseCase.confirmSettlementRecord(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('recordId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/settlement-records/:recordId/cancel', async (c) => {
    const input = await parseJsonBody(c, settlementRecordStatusSchema)
    const data = await container.budgetUseCase.cancelSettlementRecord(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('recordId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/settlement-records/:recordId/transfer-paid', async (c) => {
    const input = await parseJsonBody(c, settlementTransferPaidSchema)
    const data = await container.budgetUseCase.setSettlementTransferPaid(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('recordId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/expenses/export.csv', async (c) => {
    const data = await container.budgetUseCase.exportCsv(requestContext(c), c.req.param('tripId'))
    return c.body(data, 200, {
      'content-type': 'text/csv; charset=utf-8',
    })
  })

  app.post('/trips/:tripId/expenses', async (c) => {
    const input = await parseJsonBody(c, createExpenseSchema)
    const data = await container.budgetUseCase.createExpense(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/reorder', async (c) => {
    const input = await parseJsonBody(c, reorderIdsSchema)
    const data = await container.budgetUseCase.reorderExpenses(
      requestContext(c),
      c.req.param('tripId'),
      input.orderedIds,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/expenses/:expenseId', async (c) => {
    const input = await parseJsonBody(c, updateExpenseSchema)
    const data = await container.budgetUseCase.updateExpense(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('expenseId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/:expenseId/members', async (c) => {
    const input = await parseJsonBody(c, setExpenseMembersSchema)
    const data = await container.budgetUseCase.setExpenseMembers(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('expenseId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/expenses/:expenseId/paid', async (c) => {
    const input = await parseJsonBody(c, toggleExpensePaidSchema)
    const data = await container.budgetUseCase.toggleExpensePaid(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('expenseId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/expenses/:expenseId', async (c) => {
    const data = await container.budgetUseCase.deleteExpense(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('expenseId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/packing/bags', async (c) => {
    const data = await container.packingUseCase.listBags(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/bags', async (c) => {
    const input = await parseJsonBody(c, createPackingBagSchema)
    const data = await container.packingUseCase.createBag(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/packing/bags/:bagId', async (c) => {
    const input = await parseJsonBody(c, updatePackingBagSchema)
    const data = await container.packingUseCase.updateBag(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('bagId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/packing/bags/:bagId', async (c) => {
    const data = await container.packingUseCase.deleteBag(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('bagId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/packing/category-assignees', async (c) => {
    const data = await container.packingUseCase.listCategoryAssignees(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.put('/trips/:tripId/packing/category-assignees', async (c) => {
    const input = await parseJsonBody(c, setCategoryAssigneesSchema)
    const data = await container.packingUseCase.setCategoryAssignees(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/suggestions', async (c) => {
    const input = await parseJsonBody(c, packingSuggestionsSchema)
    const data = await container.packingUseCase.suggestItems(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/templates', async (c) => {
    const input = await parseJsonBody(c, savePackingTemplateSchema)
    const data = await container.packingUseCase.saveTemplateFromTrip(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/templates/:templateId/apply', async (c) => {
    const input = await parseJsonBody(c, applyPackingTemplateSchema)
    const data = await container.packingUseCase.applyTemplate(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('templateId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/packing/items', async (c) => {
    const data = await container.packingUseCase.listItems(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/items', async (c) => {
    const input = await parseJsonBody(c, createPackingItemSchema)
    const data = await container.packingUseCase.createItem(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/items/bulk-import', async (c) => {
    const input = await parseJsonBody(c, bulkImportPackingSchema)
    const data = await container.packingUseCase.bulkImport(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/packing/items/reorder', async (c) => {
    const input = await parseJsonBody(c, reorderPackingItemsSchema)
    const data = await container.packingUseCase.reorderItems(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/packing/items/:itemId', async (c) => {
    const input = await parseJsonBody(c, updatePackingItemSchema)
    const data = await container.packingUseCase.updateItem(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('itemId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/packing/items/:itemId', async (c) => {
    const data = await container.packingUseCase.deleteItem(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('itemId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/todos', async (c) => {
    const data = await container.todoUseCase.listTodos(requestContext(c), c.req.param('tripId'))
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/todos', async (c) => {
    const input = await parseJsonBody(c, createTodoSchema)
    const data = await container.todoUseCase.createTodo(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/todos/reorder', async (c) => {
    const input = await parseJsonBody(c, reorderTodosSchema)
    const data = await container.todoUseCase.reorderTodos(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/todos/category-assignees', async (c) => {
    const data = await container.todoUseCase.listCategoryAssignees(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.put('/trips/:tripId/todos/category-assignees', async (c) => {
    const input = await parseJsonBody(c, setCategoryAssigneesSchema)
    const data = await container.todoUseCase.setCategoryAssignees(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.patch('/trips/:tripId/todos/:todoId', async (c) => {
    const input = await parseJsonBody(c, updateTodoSchema)
    const data = await container.todoUseCase.updateTodo(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('todoId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/todos/:todoId/toggle', async (c) => {
    const input = await parseJsonBody(c, toggleTodoSchema)
    const data = await container.todoUseCase.toggleTodo(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('todoId'),
      input.done,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/notifications/reminders', async (c) => {
    const data = await container.reminderUseCase.createTripReminders(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/todos/:todoId', async (c) => {
    const data = await container.todoUseCase.deleteTodo(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('todoId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/attachments', async (c) => {
    const data = await container.collaborationUseCase.listAttachments(
      requestContext(c),
      c.req.param('tripId'),
      c.req.query('subjectType'),
      c.req.query('subjectId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/attachments', async (c) => {
    const input = await parseJsonBody(c, createAttachmentSchema)
    const data = await container.collaborationUseCase.createAttachment(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/attachments/:attachmentId', async (c) => {
    const data = await container.collaborationUseCase.deleteAttachment(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('attachmentId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/attachments/:attachmentId/content', async (c) => {
    const result = await container.collaborationUseCase.getAttachmentContent(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('attachmentId'),
    )
    return c.body(result.bytes, 200, {
      'content-type': result.attachment.mimeType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${result.attachment.fileName.replaceAll('"', '')}"`,
    })
  })

  app.get('/trips/:tripId/photos', async (c) => {
    const data = await container.planningUseCase.listTripPhotoRefs(
      requestContext(c),
      c.req.param('tripId'),
      c.req.query('subjectType'),
      c.req.query('subjectId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/photos', async (c) => {
    const input = await parseJsonBody(c, linkTripPhotoSchema)
    const data = await container.planningUseCase.linkTripPhoto(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/photos/:photoRefId', async (c) => {
    const data = await container.planningUseCase.deleteTripPhotoRef(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('photoRefId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/share-links', async (c) => {
    const data = await container.collaborationUseCase.listShareLinks(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/share-links', async (c) => {
    const input = await parseJsonBody(c, createShareLinkSchema)
    const data = await container.collaborationUseCase.createShareLink(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/share-links/:linkId/revoke', async (c) => {
    const data = await container.collaborationUseCase.revokeShareLink(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('linkId'),
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/discussion-refs', async (c) => {
    const data = await container.collaborationUseCase.listDiscussionRefs(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/discussion-refs', async (c) => {
    const input = await parseJsonBody(c, createDiscussionRefSchema)
    const data = await container.collaborationUseCase.createDiscussionRef(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/discussions', async (c) => {
    const input = await parseJsonBody(c, startDiscussionSchema)
    const data = await container.collaborationUseCase.startDiscussion(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/decision-refs', async (c) => {
    const data = await container.collaborationUseCase.listDecisionRefs(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/decision-refs', async (c) => {
    const input = await parseJsonBody(c, createDecisionRefSchema)
    const data = await container.collaborationUseCase.createDecisionRef(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/automation-tasks', async (c) => {
    const data = await container.automationUseCase.listTasks(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/automation-tasks', async (c) => {
    const input = await parseJsonBody(c, createAutomationTaskSchema)
    const data = await container.automationUseCase.createTask(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/buddy-bindings', async (c) => {
    const data = await container.communityUseCase.listBuddyBindings(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/buddy-bindings', async (c) => {
    const input = await parseJsonBody(c, bindTripBuddySchema)
    const data = await container.communityUseCase.bindBuddy(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.delete('/trips/:tripId/buddy-bindings/:bindingId', async (c) => {
    const data = await container.communityUseCase.revokeBuddy(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('bindingId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/buddy-plans/dispatch', async (c) => {
    const input = await parseJsonBody(c, dispatchBuddyPlanSchema)
    const data = await container.communityUseCase.dispatchPlan(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/buddy-plans', async (c) => {
    const data = await container.communityUseCase.listPlanDrafts(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/buddy-plans', async (c) => {
    const input = await parseJsonBody(c, proposeBuddyPlanSchema)
    const data = await container.communityUseCase.proposePlan(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/buddy-plans/:draftId/review', async (c) => {
    const input = await parseJsonBody(c, reviewBuddyPlanSchema)
    const data = await container.communityUseCase.reviewPlan(
      requestContext(c),
      c.req.param('tripId'),
      c.req.param('draftId'),
      input.status,
    )
    return c.json(ok(data))
  })

  app.get('/trips/:tripId/community-shares', async (c) => {
    const data = await container.communityUseCase.listShares(
      requestContext(c),
      c.req.param('tripId'),
    )
    return c.json(ok(data))
  })

  app.post('/trips/:tripId/community-shares', async (c) => {
    const input = await parseJsonBody(c, shareTripToCommunitySchema)
    const data = await container.communityUseCase.shareTrip(
      requestContext(c),
      c.req.param('tripId'),
      input,
    )
    return c.json(ok(data))
  })

  return app
}
